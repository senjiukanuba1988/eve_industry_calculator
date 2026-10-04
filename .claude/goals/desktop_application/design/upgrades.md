# Upgrades and Data Migration

Concrete design for the upgrade rules in [data-storage](../openspec/specs/data-storage/spec.md): converting older data automatically, keeping a pre-conversion copy, and refusing data an older build cannot understand. Task 5 of `desktop_application`. Builds on the files, `manifest.json` and atomic commit protocol defined in [data-files.md](data-files.md).

## Two version numbers

`manifest.json` carries both:

| Field | Example | What it is | Used for |
|---|---|---|---|
| `formatVersion` | `1` | Integer naming the layout of the files. Raised by exactly 1 with every change to what any file can contain. | Every decision: start, convert, or refuse |
| `writtenBy` | `"1.2.0"` | Version of the application that last wrote to the folder | Naming versions in messages only |

Each build knows one number, `CURRENT_FORMAT`: the newest format it can read and the only one it writes.

**Refusal is decided by format, not by app version.** An older build starts normally against data a newer build wrote, as long as the format is one it knows. So reinstalling the previous release after a bad update just works, unless that update changed the format; in that case the backup it made is the way back.

**This is only safe if every change to a file's shape raises `formatVersion`** — including adding an optional field, a new enum value such as a new recipe type, or a new file. Otherwise an older build would load the data, ignore the field it does not know, and drop it on its next save. The per-format fixtures (see *Testing*) are how that rule is enforced in practice.

**Before the first real release**, while there is no data worth keeping, the format stays at 1 and may change freely. From the first build the user runs against real data onwards, the rule above applies without exception.

## Start-up sequence

Runs before the window shows any data:

1. **Recover an interrupted write.** Roll the last commit forward or discard stray `.tmp` files, as described in data-files.md.
2. **Find the folder.** If `Documents\EVE Industry Calculator` does not exist, create it with empty data files and a manifest at `CURRENT_FORMAT`, then start. No conversion and no message.
3. **Read `manifest.json`.** If the folder exists but the manifest is missing, is not valid JSON, or has no whole-number `formatVersion`, show the malformed-data error naming `manifest.json`.
4. **Compare `formatVersion` with `CURRENT_FORMAT`:**
   - **Greater:** refuse. Show *"This data was written by EVE Industry Calculator 1.4.0, which arranges it in a newer way than this version (1.2.0) understands. Install 1.4.0 or later to open it. Nothing has been changed."* Offer to open the data folder. Write nothing, including the manifest.
   - **Equal:** load and validate as in data-files.md, then start. `writtenBy` is brought up to date by the next commit that writes anything.
   - **Less:** convert, as below.
5. **Remove expired completed plans** (seven-day rule) as an ordinary commit, then show the window.

## Converting

### Conversion steps

The code holds an ordered list of conversion steps, one per format change:

```ts
type DataFiles = Map<string, unknown>;   // file name -> parsed JSON, manifest excluded

interface ConversionStep {
  from: number;                           // converts format `from` to `from + 1`
  describe: string;                       // one line, for the message and the log, e.g. "Recipes gain a facility field"
  convert(files: DataFiles): DataFiles;   // pure: no I/O, no clock, no randomness
}
```

- A step receives every data file and returns every data file. It may reshape, add, rename or drop whole files.
- Steps are pure functions of their input, so each one can be tested on its own.
- A step must not assume the input is valid beyond what the previous format guaranteed. Where it meets something it cannot convert, it throws an error that says which file and where, as a path into the data, e.g. `plans.json → plans[2].steps[0].runs: expected a whole number`.
- Steps are never edited once released. A mistake in a released step is corrected by a new step on top of it.

### The sequence

1. **Read all files raw.** Parse each one as JSON, with the repeated-key check. Syntax errors here are reported with their line, like any malformed data. Nothing is validated against the current format yet.
2. **Run the chain** of steps from the data's format up to `CURRENT_FORMAT`, entirely in memory.
3. **Validate the result** with the full load-time validation of the current format.
4. **If step 2 or 3 fails:** nothing has been written. Show *"Your data could not be converted from format 1 to format 3"*, with the failing step's description and the error, saying that the files are unchanged. Offer to open the data folder and to try again. Do not start.
5. **Back up.** Copy every file in the folder except `backups\` itself, byte for byte, to a new backup folder (below). If the copy fails, stop with an error; nothing has been converted.
6. **Commit** the converted files and a new manifest (`formatVersion: CURRENT_FORMAT`, `writtenBy`: this build) in one atomic commit. Files the conversion dropped are deleted as part of the same commit.
7. **Start**, and show a one-off message: *"Your data was converted from format 1 (last written by 1.2.0) to format 3 so this version can use it. A copy of the files as they were is in `backups\format 1 to 3 - 2026-10-04 16-32`."* List each step's description, and offer to open the backup folder. The message is shown once and not again.

A crash at any point leaves either the original files (before the commit point in step 6) or the fully converted ones (after it). The backup may already exist in the first case; on the next start the conversion simply runs again and makes a second, identical backup.

### Backups

```
EVE Industry Calculator\
  backups\
    format 1 to 3 - 2026-10-04 16-32\
      manifest.json
      items.json
      recipes.json
      hangar.json
      plans.json
```

- They live inside the data folder, so copying the folder copies them too.
- The folder is named after the conversion and the local date and time; a ` (2)` suffix is added if the name is already taken.
- The application never deletes backups. Conversions are rare, and the user removes old ones when they like.
- The application never reads `backups\`. Its contents are not validated and cannot make start-up fail.
- **Going back to an older build** after a conversion: close the app, copy the backup's files over the data files, and install the older build. This is the only supported way down across a format change, and the conversion message says where the backup is.

## Atomic commit: deleting files

The commit protocol in data-files.md replaces files. For conversions that drop a file, `commit.json` lists each file with an action:

```json
{
  "replace": ["manifest.json", "recipes.json", "plans.json"],
  "delete": ["hangar.json"]
}
```

Roll-forward on start applies both: renames each listed `.tmp` that still exists, and deletes each listed file that still exists. Everyday writes only ever use `replace`.

## Testing

- **A fixture data folder for every format** lives in the repository and is never changed once that format is released. It is a realistic small dataset: a few categories, items and recipes including a T2 variant pair, hangar stock, one reserved plan with started and done steps, and one completed plan.
- **Chain test:** every fixture is converted to `CURRENT_FORMAT` and must pass full validation. Where the expected result is known, it is compared exactly.
- **Step tests:** each step is tested on its own against its `from` fixture, including at least one malformed input that must throw with a useful path.
- **Format-change guard:** a test that serialises the current fixture and compares it with a schema snapshot checked into the repository. Changing the shape of any file makes it fail, with a message saying to raise `formatVersion` and add a conversion step. This is the safety net for the rule that every shape change is a new format.
- **Start-up tests,** run against the storage interface with a temporary folder: same format starts silently; older format converts, creates exactly one backup and shows the message; newer format refuses and leaves every file byte-identical; a conversion that throws leaves every file byte-identical and creates no commit; a crash simulated between backup and commit leaves the original data in place.

## First release

The first build ships with `CURRENT_FORMAT = 1`, an empty list of conversion steps, and all of the above in place: the version comparison, the refusal, the backup and commit path, and the tests. The first real format change should not also be the first time this code runs.
