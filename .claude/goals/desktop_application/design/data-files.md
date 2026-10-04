# Data Files — Format and Folder Layout

Concrete design for what [data-storage](../openspec/specs/data-storage/spec.md) describes in behavioural terms. Task 4 of `desktop_application`. How the version marker is used for upgrades and migration is task 5 and lives in its own document.

## The folder

```
%USERPROFILE%\Documents\EVE Industry Calculator\
  manifest.json     format version + app version that last wrote the folder
  items.json        categories and the items in them
  recipes.json      all recipes
  hangar.json       general (unreserved) stock
  plans.json        all plans, with their reserved piles and step progress
  backups\          pre-conversion copies, one subfolder per conversion (see upgrades.md)
```

- `Documents` is resolved through the Windows known-folder API, not built from `%USERPROFILE%`, so a Documents folder redirected to OneDrive or another drive is found correctly.
- If Documents is synced by OneDrive, the sync client can briefly lock a file. File renames retry a few times with a short backoff before reporting a failure.
- **First start:** if the folder does not exist, it is created with an empty set of files and a fresh `manifest.json`.
- **Missing file:** if the folder exists but one of the five files is missing, that is reported as malformed data, naming the missing file. It is never silently recreated empty. An accidentally deleted `recipes.json` must not look like "you have no recipes".
- Temporary files from an interrupted write (see *Atomic writes*) may briefly appear next to these. Nothing else is stored in the folder.

## Format rules (all files)

- **JSON**, UTF-8 without BOM.
- **Pretty-printed:** two-space indentation, one key or array element per line, trailing newline. Equivalent to PHP's `JSON_PRETTY_PRINT`.
- Written with LF line endings. CRLF is accepted on read, so hand edits in any editor are fine.
- **Stable order:** keys within an object always appear in the order shown below. Maps keyed by item name are sorted alphabetically, ignoring case. Lists are sorted as noted per file. Saving unchanged data produces a byte-identical file.
- **Optional fields are omitted** rather than written as `null` or `""` (no variant → no `variant` key, no notes → no `notes` key).
- **Quantities** are plain whole numbers (`296949`, never `"296,949"`).
- **Times** are ISO 8601 in local time with the UTC offset, to the second: `"2026-10-04T16:32:05+02:00"`. They are readable as-is, and they are unambiguous across daylight-saving changes or a move to another machine.
- **Repeated keys are an error.** Plain JSON parsers let the last copy of a repeated key win silently, so a hand edit that duplicates an input line would lose data without a word. The loader detects repeated keys and reports them as malformed, with the line.

## References are by name, never by ID

No file contains a generated ID. Everything is referred to by what the user would call it:

| Thing | Referred to by | Unique because |
|---|---|---|
| Category | its name | spec: unique ignoring case |
| Item | its name | spec: unique ignoring case |
| Recipe | product name + variant label (label absent when the product has one recipe) | spec: one recipe per product, except T2 variants with distinct labels |
| Plan | nothing refers to a plan | — |

Consequences:

- **Renaming an item** rewrites every file it appears in: `items.json`, `recipes.json`, `hangar.json`, and `plans.json` (targets, variant choices, reserved piles, step snapshots). This happens in one atomic write.
- **Adding a second T2 variant**, where the first had no label, writes the new label onto the first recipe. In the same write, every plan that was implicitly using the sole recipe gets an explicit `variantChoices` entry for it. That is how "the plan keeps using the recipe it was already using" is honoured.
- In stored data, names must match the catalog entry **exactly**, including case. A reference that matches nothing is malformed data: the loader names the file and line, for example *`recipes.json` line 214: input "Sulfuric Acd" is not an item in items.json*. This is what catches a rename done by hand in only one file.

## The files

### manifest.json

```json
{
  "formatVersion": 1,
  "writtenBy": "1.0.0",
  "note": "Data folder of EVE Industry Calculator. Only edit these files while the application is closed."
}
```

- `formatVersion`: integer, raised by 1 with every change to what any file can contain. Decides whether to start, convert or refuse (see [upgrades.md](upgrades.md)).
- `writtenBy`: version of the application that last wrote to the folder. Used only to name versions in messages; refusal is decided by `formatVersion` (see [upgrades.md](upgrades.md)).
- `note`: written for the human reader, ignored on load.

### items.json

```json
{
  "categories": {
    "Minerals": [
      "Pyerite",
      "Tritanium"
    ],
    "Planetary P3": [
      "Robotics"
    ],
    "Ships": []
  },
  "uncategorised": [
    "Tungsten Carbide"
  ]
}
```

- Categories are sorted by name. Items within a category, and in `uncategorised`, are sorted by name.
- An empty list means a category with no items, which is allowed.
- Every item appears exactly once across all lists. The same name, ignoring case, in two places is malformed.

### recipes.json

```json
{
  "recipes": [
    {
      "product": "Acolyte II",
      "variant": "Accelerant Decryptor",
      "type": "T2 Manufacturing",
      "output": 1,
      "notes": "Invention via Accelerant",
      "inputs": {
        "Acolyte I": 1,
        "Morphite": 1,
        "Robotics": 1
      }
    },
    {
      "product": "Tungsten Carbide",
      "type": "Reaction",
      "output": 10000,
      "inputs": {
        "Rolled Tungsten Alloy": 98,
        "Sulfuric Acid": 98
      }
    }
  ]
}
```

- Sorted by product, then variant.
- `type` is one of `"T1 Manufacturing"`, `"T2 Manufacturing"`, `"Reaction"`, `"Planetary Industry"`, spelled out in words.
- `inputs` is a map from item name to per-run quantity. Being a map, the same input cannot appear twice (repeated keys are rejected on load).

### hangar.json

```json
{
  "stock": {
    "Construction Blocks": 500,
    "Sulfuric Acid": 98,
    "Tritanium": 1000000
  }
}
```

- **General, unreserved stock only.** Reserved material lives on the plan holding it (see `plans.json`). The Hangar section adds the two together for its available / reserved / total columns.
- Items with a quantity of zero are removed, never stored as `0`.

### plans.json

```json
{
  "plans": [
    {
      "name": "80 Flycatchers",
      "target": {
        "product": "Flycatcher"
      },
      "runs": 80,
      "created": "2026-10-04T16:32:05+02:00",
      "variantChoices": {
        "Acolyte II": "Accelerant Decryptor"
      },
      "reserved": {
        "Construction Blocks": 2000,
        "Robotics": 4
      },
      "steps": [
        {
          "state": "done",
          "product": "Robotics",
          "runs": 6,
          "inputsPerRun": {
            "Consumer Electronics": 10,
            "Reactive Metals": 10
          },
          "outputPerRun": 1,
          "takenFrom": "reserved",
          "deducted": {
            "Consumer Electronics": 60,
            "Reactive Metals": 60
          },
          "started": "2026-10-05T09:10:00+02:00",
          "done": "2026-10-06T21:44:12+02:00",
          "addedToReserved": 6,
          "addedToGeneral": 0
        },
        {
          "state": "started",
          "product": "Tungsten Carbide",
          "runs": 5,
          "inputsPerRun": {
            "Rolled Tungsten Alloy": 98,
            "Sulfuric Acid": 98
          },
          "outputPerRun": 10000,
          "takenFrom": "reserved",
          "deducted": {
            "Rolled Tungsten Alloy": 490,
            "Sulfuric Acid": 450
          },
          "short": {
            "Sulfuric Acid": 40
          },
          "started": "2026-10-06T21:50:00+02:00"
        }
      ]
    },
    {
      "name": "30 Acolyte II",
      "target": {
        "product": "Acolyte II",
        "variant": "Symmetry Decryptor"
      },
      "runs": 30,
      "created": "2026-09-30T11:02:41+02:00",
      "completed": "2026-10-03T18:20:00+02:00",
      "steps": []
    }
  ]
}
```

**Plan fields**

| Field | Meaning |
|---|---|
| `name` | Free text, not required to be unique. Nothing refers to a plan by name. |
| `target` | Product + variant of the target recipe. Fixed at creation. |
| `runs` | Run count. Fixed at creation. |
| `created` | When the plan was created. |
| `completed` | Present only on a completed plan. Its presence *is* the completed status, and it drives the seven-day removal. |
| `variantChoices` | Map from intermediate product to chosen variant label. A choice pointing at a recipe that no longer exists is kept and flagged, not treated as malformed: the spec says the plan asks again. |
| `reserved` | Present only while the plan is reserved: its pile, item to quantity. Absent means unreserved. |
| `steps` | Started and done steps only (see below), in the order they were started or done. |

**Only started and done steps are stored.** Not-started build entries and Acquire entries are recalculated every time from recipes, stock and the stored steps, so there is nothing to keep in sync. Each stored step is a frozen snapshot, as the spec requires of a started step:

| Field | Meaning |
|---|---|
| `state` | `"started"` or `"done"` |
| `product`, `variant` | Which recipe, as it was when the step was started |
| `runs`, `inputsPerRun`, `outputPerRun` | The recipe's figures at the moment of starting, used when completing or reverting the step |
| `takenFrom` | `"reserved"` or `"general"`: where the inputs were deducted from, and so where a revert returns them to. If the reservation has since been released, a revert returns them to general stock. |
| `deducted` | What was actually deducted, after clamping at zero. Absent if done directly without deducting inputs. |
| `short` | Shortfall recorded at start, per item. Absent if none. |
| `started` | When it was started. Absent if marked done directly without starting. |
| `done` | When it was done. Present only when `state` is `"done"`. |
| `addedToReserved`, `addedToGeneral` | Done steps only: how the output was split between the plan's pile and general stock, so a revert removes it from the right places |
| `notRemoved` | Present after a revert from done that could not remove all of the output, because it had been spent: the quantity that could not be removed |

Reverting a step from started to not started removes it from `steps`. Reverting from done to started drops `done` and the `addedTo…` fields.

**Retention:** on every application start, a plan whose `completed` time is more than seven days (7 × 24 hours) ago is removed from `plans.json`. This is done as one ordinary atomic write before the window shows any data. Removal never touches the hangar, because a completed plan holds no reservation.

## Atomic writes

Every user action is saved as soon as it completes. Many actions change more than one file: starting a step changes `hangar.json` and `plans.json`, and renaming an item can change four files. The spec requires that a crash never leaves the data half-applied, so writes go through a small commit protocol:

1. Write the new content of each changed file to `<name>.json.tmp` and flush it to disk.
2. Write `commit.json`, listing the files about to be replaced (and, for conversions only, files to delete — see [upgrades.md](upgrades.md)), to a temp file of its own, then rename it into place. **This rename is the commit point.**
3. Rename each `<name>.json.tmp` over `<name>.json`.
4. Delete `commit.json`.

On start, before anything is read:

- **`commit.json` is present:** the action had committed but was not fully applied. Finish step 3 for every listed file whose `.tmp` still exists, then delete `commit.json`.
- **No `commit.json`, but `.tmp` files are present:** the action never committed. Delete the `.tmp` files.

Either way the folder ends up wholly before or wholly after the interrupted action, never in between.

`manifest.json` is rewritten as part of a commit only when its contents change, for example the first write by a newer application version.

## Validation on load

The loader re-checks everything the application would refuse to save, since a hand edit could have broken any of it:

- valid JSON, with no repeated keys
- the expected structure and field types, and quantities that are whole numbers of at least 1
- unique category and item names, ignoring case and surrounding whitespace; every item listed exactly once
- every reference in recipes, the hangar and reserved piles names an existing item
- the recipe rules: at least one input, no recipe consuming its own product, at most one recipe per product except T2, distinct variant labels, one type per product, no cycles
- every incomplete plan's target names an existing item and recipe (deleting a recipe that an incomplete plan targets is refused, so only completed plans can have lost theirs; a completed plan's target is not checked at all, since its recipe and then its item may be deleted)

Any failure is reported as malformed data in the form the spec requires: the file, the line where it can be pinned down, what was found, and what was expected there. The application then does not start against the data and writes nothing.

Not treated as malformed: a `variantChoices` entry or a stored step naming a recipe or item that no longer exists (stored steps are a record of what happened, and a plan's history does not protect an item from deletion) (the spec defines how plans handle these), and hangar stock of an item no recipe references any more (the spec says it stays, flagged).
