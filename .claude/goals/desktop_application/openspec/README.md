# Desktop Application — Specification

What the desktop version of the EVE industry calculator should do, written from the user's point of view. No technology choices appear anywhere in here; those come next, as a separate step.

Written in the [OpenSpec](https://openspec.dev/) convention: capabilities, each with requirements written as SHALL statements, each illustrated by WHEN/THEN scenarios that can be read as acceptance tests.

## Read in this order

| | Capability | What it covers |
|---|---|---|
| 1 | [project.md](project.md) | Why the app exists, who uses it, the vocabulary, what is out of scope |
| 2 | [application-shell](specs/application-shell/spec.md) | One window, four sections, how the app behaves everywhere |
| 3 | [item-catalog](specs/item-catalog/spec.md) | Items and categories; why "base material" is derived, not tagged |
| 4 | [recipe-library](specs/recipe-library/spec.md) | Recording how things are made; autocomplete entry; validation |
| 5 | [material-calculation](specs/material-calculation/spec.md) | The arithmetic: expansion, whole runs, leftovers, netting, build order |
| 6 | [hangar](specs/hangar/spec.md) | The saved record of what you own; pasting, resetting, correcting |
| 7 | [production-plans](specs/production-plans/spec.md) | Saved projects, the checklist, starting and finishing jobs, reservations |
| 8 | [data-storage](specs/data-storage/spec.md) | Readable files, one visible folder, surviving an update |

## What is new compared to the web version

The desktop app keeps everything the Angular/PHP version does — categories, items, recipes of four types, recursive explosion to base materials, batch leftovers, the runs-per-recipe build plan, and netting against pasted hangar contents — and changes the following.

| | Web version today | Desktop version |
|---|---|---|
| Hangar | Pasted fresh for every calculation, never stored | One saved hangar the app owns and keeps up to date |
| Calculations | Thrown away when you leave the page | Saved **plans**, any number in flight, worked over weeks |
| Results | Three read-only tables | An ordered checklist you tick through |
| Jobs | Not tracked | Start a step (inputs leave the hangar), finish it (output arrives) |
| Competing projects | Not a concept | A plan can **reserve** its materials so nothing else counts on them |
| Item entry | Type names, press "Check Items", create unknowns | Autocomplete as you type, create inline, no separate check step |
| Ambiguous intermediates | Calculation fails | You are asked which variant to use, and the plan remembers |
| Layout | Four pages with top navigation | One window: sidebar of Plans / Recipes / Hangar / Items, plus a main panel |
| Storage | MySQL in a Docker volume, dumped to SQL on demand | Readable files in one visible folder |

Existing recipe data in `backend/db/seeds/recipe_data.sql` is **not** migrated — re-entered by hand, as agreed.

## Decisions taken in writing this, worth a second look

These were derived from the interview rather than stated outright. Each is a deliberate call, not an oversight — say the word on any of them and the spec changes.

1. **"Recipe", not "blueprint".** In-game, manufacturing uses blueprints, reactions use formulas, and planetary industry uses schematics. One neutral word is used throughout. Purely a labelling choice.
2. **A hangar reset clears *all* step progress of incomplete plans, including steps already marked done** — not only the ones in progress. Completed plans are left untouched. Started steps are deliberately cleared too, even though their jobs are still running in-game: after a reset the user re-marks running jobs as started by hand, accepting the shortfall warning (confirmed in review). The reasoning: after a reset and a fresh paste, the components those steps produced are back in the hangar as real stock, and a live-recalculating plan will see them and drop the steps anyway. Keeping the ticks as well would say the same thing twice.
3. **T2 variants must carry distinct, non-empty labels** when a product has more than one recipe. Today the label is optional even for variants. The plan has to ask you which variant to use, which it cannot do if two of them look identical.
4. **A recipe cannot be deleted while an incomplete plan targets it.** Alternative would be to let the plan go stale and flag it.
5. **Acquire entries cannot be ticked by hand.** Buying 4,750 Tritanium is "done" when 4,750 Tritanium is in the hangar, and the app can see that for itself. Only build steps are tickable.
6. **The data folder is a fixed, visible location**, not one you choose during installation. Visible and copyable was the requirement; choosing the path was not asked for.
7. **A paste into an empty app stores nothing.** Only items some recipe references are kept, so recipes have to be entered before stock is worth pasting. Natural order of work, but worth knowing.
8. **Cycle detection on save** (A needs B needs C needs A) is specified although the current app has no such check. Without it a plan can expand forever.
9. **The single-window layout was chosen by Claude, not specified by you.** You said to go wild and pick what works best, so `application-shell` states it as a requirement like any other — but unlike the rest of the spec it rests on nobody's stated preference. Overrule it freely; nothing in the other six capabilities depends on it.

## A note on the OpenSpec layout used here

These are written as **baseline specs** — `openspec/specs/<capability>/spec.md`, describing the application as it should be — rather than as a change proposal under `openspec/changes/`. There is no `changes/`, no `archive/`, and no `AGENTS.md`, and the OpenSpec CLI has not been run against this directory. The reason: the whole application is new, so there is no existing baseline for a change to be a delta against, and requirements read better stated outright than as `## ADDED Requirements`. If the tooling gets adopted later, this directory is the baseline it would start from, and subsequent work would go in as changes on top.
