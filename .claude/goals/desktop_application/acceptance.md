# Acceptance checklist

This file maps every OpenSpec scenario of the desktop app to its automated evidence and lists the checks that only the user can do by hand.

Date: 2026-10-12. Scenarios: 140. **AUTO 135, MANUAL 5, PARTIAL 0, GAP 0.**

Test paths are relative to `desktop_app/src/` unless they start with `src-tauri/`. PS = `ui/sections/PlansSection.test.tsx`.

## Manual checks for the user

### Install, update, uninstall
- [ ] Install build N, create some data, then install build N+1 over it. Expect no prompts and the data unchanged.
- [ ] Uninstall without ticking anything. Expect the data folder to remain and the message to name its path.
- [ ] Uninstall again with "Delete the application data" ticked. Expect what the option promises, and check the message and folder name match the real folder.
- [ ] Once a real data-format change exists: copy the files from `backups/` over the data files, install the older build, and start it. Expect a silent start with the old data.

### Start-up and window
- [ ] Start the app, minimise it, then start it again. Expect no second window, and the first window comes to the front.
- [ ] Turn off Wi-Fi/LAN and start the installed build. Create a recipe and a plan, paste stock, work a step, and open the data folder. Expect everything to work.

### Data folder
- [ ] Check the path shown in the Data folder section is the real Documents path (OneDrive-redirected, if that applies).
- [ ] Click "Open data folder". Expect Explorer to open that folder, including when Documents is on OneDrive.
- [ ] Open a real `recipes.json` and `hangar.json` in a text editor. Expect them to be readable (product, inputs, one item per line).

### Saving and restarting
- [ ] Reserve a plan, then close and reopen the real app. Expect the hangar and the reserved pile to be unchanged.
- [ ] Optional: right after marking a step done, kill the process in Task Manager and restart. Expect consistent data (the step and the stock change are either both there or both missing).
- [ ] Backup: with the app closed, copy the data folder, make changes in the app, close it, copy the folder back, and start. Expect the old state.
- [ ] Moving machines: install on a second machine, put a copy of the folder in `Documents\EVE Industry Calculator`, and start. Expect the same recipes, stock and plans.

### Hangar paste with real game text
- [ ] Paste real text from the EVE inventory window. Expect correct quantities, including thousands separators.
- [ ] Paste real text from the EVE assets window. Expect the trailing columns to be ignored and the quantities to be right.
- [ ] Paste a full real station hangar. Expect only recipe-relevant items to be kept, with the rest listed as ignored and the reason given.

### Real use
- [ ] Re-enter the real recipe data and work one real plan end to end: reserve, start, complete, finish, then check the hangar afterwards.

## application-shell

| Scenario | Status | Evidence |
|---|---|---|
| Starting with existing plans | AUTO | `ui/Shell.test.tsx:59`; open plan not remembered by construction (`Shell.tsx` view state is plain useState) |
| Starting with recipes but no open plans | AUTO | `Shell.test.tsx:67`; PS:82 |
| Starting with nothing | AUTO | `Shell.test.tsx:74`; `RecipeForm.test.tsx:43` |
| Returning to a section | AUTO | PS:304; `Shell.test.tsx:84`; `RecipeForm.test.tsx:197` |
| From a recipe to a new plan | AUTO | `ui/sections/Jumps.test.tsx:49`, `:58` |
| From a plan step to its recipe | AUTO | `Jumps.test.tsx:69` |
| From a material to its stock | AUTO | `Jumps.test.tsx:91` |
| No network available | MANUAL | No fetch/http and no external fonts; capabilities are core/opener only. Offline check above |
| Resetting the hangar | AUTO | `HangarSection.test.tsx:125`; `ConfirmDialog.test.tsx:54/62/69` |
| Deleting a plan that holds reservations | AUTO | PS:119 (names plan and materials, confirm returns them); PS "deletes nothing when the confirmation is cancelled, leaving the reservation and the hangar alone" |
| Save rejected by a validation rule | AUTO | `RecipeForm.test.tsx:98`, `:160`; `ui/Failure.test.tsx:50` |

## data-storage

| Scenario | Status | Evidence |
|---|---|---|
| Opening the data in a text editor | AUTO | `core/data/serialize.test.ts:15` (byte-for-byte vs `fixtures/format-1`); `jsonWrite.test.ts:4/18`. Readability is checked by eye above |
| Inspecting stock outside the application | AUTO | `serialize.test.ts:15`, `:30` |
| Finding the data | AUTO | `Shell.test.tsx:104`; `ui/Startup.test.tsx:42`; the real path and Explorer opening are checked by hand above |
| Backing up by copying | AUTO | `app/startup.test.ts` "backing up by copying: a copy of the folder, put back later, starts with exactly what it held" |
| Moving to another machine | MANUAL | Nothing machine-specific is stored. Automated support: `startup.test.ts` "backing up by copying: ...". Manual check above |
| A routine update | MANUAL | Data lives outside the install dir; `hooks.nsh` is silent in update mode; `app/store.test.ts:37` (writtenBy updated) |
| Uninstalling | MANUAL | `hooks.nsh` POSTUNINSTALL message. Folder name kept in sync by `src-tauri/src/lib.rs` test `uninstaller_names_the_release_data_folder` |
| Upgrading into a new layout | AUTO | `startup.test.ts:180`, `:208`; `Startup.test.tsx:84` (uses a made-up format 1 to 2) |
| A conversion that cannot be completed | AUTO | `startup.test.ts:223`, `:238`, `:253`; `Startup.test.tsx:70` |
| Going back after a conversion | AUTO (+manual) | `startup.test.ts` "going back: the backup is a complete folder in the old format, which starts like the original"; `commit.test.ts:188`. Installing an actually older build can only be checked once a real format change exists |
| Opening data in a newer layout with an older version | AUTO | `startup.test.ts:167`; `Startup.test.tsx:59` |
| Going back to an older version that uses the same layout | AUTO | `startup.test.ts:93` (writtenBy 9.9.9 starts); same path as `:85` |
| Data in the same layout | AUTO | `startup.test.ts:85` (no conversion, 0 writes); `core/data/format.test.ts:16` |
| Starting a second copy | MANUAL | single-instance plugin plus `focus_main_window` in `lib.rs`. Manual check above |
| Losing the application mid-session | AUTO | `storage/commit.test.ts:106`, `:128`, `:155`; `startup.test.ts:99` |
| A malformed edit | AUTO | `startup.test.ts:111`, `:126`; `Startup.test.tsx:31`, `:49`; `core/data/load.test.ts` |
| A valid edit | AUTO | `startup.test.ts` "a valid edit: a quantity corrected by hand while closed is used on the next start" |

The requirement says the edit-while-closed note appears "wherever it shows the data folder". It now also appears on the start-up error screen: `Startup.test.tsx` "says when the files may be edited, beside the data folder". The `failed` screen is covered by `Startup.test.tsx` "explains data that could not be opened at all, offering the folder and another try".

## recipe-library

| Scenario | Status | Evidence |
|---|---|---|
| A batch-output reaction | AUTO | `core/recipes/saveRecipe.test.ts:48`; `RecipeForm.test.tsx:50`; `calculate.test.ts:53`, `:83` |
| A recipe with no inputs | AUTO | `saveRecipe.test.ts:77` |
| Non-positive quantities | AUTO | `saveRecipe.test.ts:81`, `:85`; `RecipeForm.test.tsx:98` |
| A second recipe for a planetary product | AUTO | `saveRecipe.test.ts:114`; `RecipeForm.test.tsx:160` |
| A second T2 variant | AUTO | `saveRecipe.test.ts:121`; PS:95, PS:248 |
| Variants that cannot be told apart | AUTO | `saveRecipe.test.ts:127`, `:134` |
| Mixing recipe types for one product | AUTO | `saveRecipe.test.ts:141` |
| Adding a second variant when the first has no label | AUTO | `saveRecipe.test.ts:152-170`; `RecipeForm.test.tsx:140` |
| Matching an existing item | AUTO | `ui/ItemField.test.tsx:50`, `:57`; `core/catalog/items.test.ts:215` |
| Creating an item inline | AUTO | `ui/sections/CatalogFlow.test.tsx` "creates the item and binds the product to it without leaving the recipe form, which then saves"; `ItemField.test.tsx:100`, `:117` |
| Saving before everything resolves | AUTO | `RecipeForm.test.tsx:83` |
| The same input twice | AUTO | `saveRecipe.test.ts:177`, `:190`; `RecipeForm.test.tsx:111` |
| A product consuming itself | AUTO | `saveRecipe.test.ts:203` |
| A circular chain | AUTO | `saveRecipe.test.ts:215`; `RecipeForm.test.tsx:131` |
| Finding all ship recipes | AUTO | `core/recipes/library.test.ts:26`; `RecipesSection.test.tsx:40` |
| Searching by name | AUTO | `library.test.ts:45`; `RecipesSection.test.tsx:40` |
| Editing a recipe an open plan uses | AUTO | `ui/sections/RecipeChanges.test.tsx:56`, `:68`; `planImpact.test.ts:63` |
| Editing a recipe a reserved plan uses | AUTO | `RecipeChanges.test.tsx:79`, `:93`; `planImpact.test.ts:98` |
| Deleting a recipe an open plan targets | AUTO | `library.test.ts:84`; `RecipesSection.test.tsx:81` |
| Deleting a recipe an open plan merely uses | AUTO | `RecipeChanges.test.tsx:106`; `RecipeChanges.test.tsx` "states that those plans will have to choose another variant"; `planImpact.test.ts:134`, `:143`, `:178` |

## item-catalog

| Scenario | Status | Evidence |
|---|---|---|
| Browsing the catalog | AUTO | `ui/sections/ItemsSection.test.tsx:34`, `:55` |
| Renaming an item | AUTO | `items.test.ts:66`, `:81`; `ItemsSection.test.tsx:68` |
| Renaming to a name already in use | AUTO | `items.test.ts:87`; `ItemsSection.test.tsx:83` |
| Changing an item's category | AUTO | `items.test.ts:115`, `:121`; `ItemsSection.test.tsx:93`; `CatalogFlow.test.tsx` "is reflected at once in the recipe and hangar filters" |
| Deleting an unused item | AUTO | `items.test.ts:136`, `:175` |
| Deleting an item a recipe depends on | AUTO | `items.test.ts:141`; `ItemsSection.test.tsx:100` |
| Deleting an item that holds stock | AUTO | `items.test.ts:156`; `ItemsSection.test.tsx:107` |
| Creating a category | AUTO | `core/catalog/categories.test.ts:27`; `CategoriesPanel.test.tsx:25`; `CatalogFlow.test.tsx` "can be chosen straight away wherever categories are chosen" |
| Creating a duplicate category | AUTO | `categories.test.ts:35`; `CategoriesPanel.test.tsx:33` |
| Deleting an empty category | AUTO | `categories.test.ts:79`; `CategoriesPanel.test.tsx:57` |
| Deleting a category in use | AUTO | `categories.test.ts:83`, `:91`; `CategoriesPanel.test.tsx:41` |
| An item with no recipe | AUTO | `calculate.test.ts:53`, `:75` |
| A base material gains a recipe | AUTO | `Jumps.test.tsx:114` |
| An intermediate loses its recipe | AUTO | `planImpact.test.ts:134`; `RecipesSection.test.tsx:59` |
| Spotting a forgotten recipe | AUTO | `Jumps.test.tsx:114` |

## material-calculation

| Scenario | Status | Evidence |
|---|---|---|
| A multi-tier product | AUTO | `core/calculation/calculate.test.ts:53` |
| The same base material reached by several paths | AUTO | `calculate.test.ts:75` |
| Demand smaller than one batch | AUTO | `calculate.test.ts:83` |
| Demand spanning several batches | AUTO | `calculate.test.ts:88` |
| Leftover is shown | AUTO | `calculate.test.ts:83` (leftover 9,400); Leftover column in `PlanView.tsx` |
| Two consumers share one batch | AUTO | `calculate.test.ts:93`, `:336` |
| Leftover does not carry between calculations | AUTO | `steps.test.ts:104/113`; `calculate.test.ts:294`; PS "viewing a plan and its details changes nothing" |
| Partly stocked intermediate | AUTO | `calculate.test.ts:115`, `:138`, `:144` |
| Fully covered item | AUTO | `calculate.test.ts:126`; PS "lists fully covered base materials in a collapsed section, so they are seen to be accounted for" (the production-plans spec now requires a collapsed "Covered materials" section) |
| Owning the final product | AUTO | `calculate.test.ts:132` |
| Choosing a variant | AUTO | `calculate.test.ts:160`, `:167`; PS:248 |
| The choice is remembered | AUTO | `plans.test.ts:151`; PS:248, PS:260; `serialize.test.ts:15` |
| A second variant is added later | AUTO | `planImpact.test.ts:193-224` |
| A remembered choice becomes invalid | AUTO | `calculate.test.ts:173`; `planImpact.test.ts:178`; PS:264 |
| Reactions before the manufacturing that consumes them | AUTO | `calculate.test.ts:217`; PS:140 |
| A readable order within a tier | AUTO | `calculate.test.ts:231`, `:243` |
| Tracing a quantity | AUTO | `calculate.test.ts:309`, `:354`, `:379`; PS:149 |

## hangar

| Scenario | Status | Evidence |
|---|---|---|
| Stock survives a restart | AUTO (+manual) | `serialize.test.ts:15`; `app/store.test.ts:22`; `startup.test.ts:75`. Close/reopen the real app (above) |
| Inventory window format | AUTO (+manual) | `core/hangar/paste.test.ts:35`, `:81`. Real paste (above) |
| Assets window format with trailing columns | AUTO (+manual) | `paste.test.ts:39`; `HangarSection.test.tsx:52`. Real paste (above) |
| Names containing digits | AUTO | `paste.test.ts:45` |
| Pasting the same list twice | AUTO | `paste.test.ts:87` |
| A line with no quantity | AUTO | `paste.test.ts:68`, `:116`; `HangarSection.test.tsx:52` |
| Pasting a whole hangar | AUTO (+manual) | `paste.test.ts:93`; `HangarSection.test.tsx:52`. Full real station hangar (above) |
| An item that becomes relevant later | AUTO | `planImpact.test.ts` "an item that becomes relevant later: saving a recipe that uses it does not bring back what a paste ignored" |
| The paste summary | AUTO | `HangarSection.test.tsx:52` |
| Resyncing with the game | AUTO | `core/hangar/reset.test.ts:40`; `HangarSection.test.tsx:125` |
| Completed plans are untouched | AUTO | `reset.test.ts:53`; `HangarSection.test.tsx:125` |
| Picking a plan back up after a reset | AUTO | `reset.test.ts` "picking a plan back up after a reset: ..." (recalculates, then reserves y/z) |
| An item's last recipe is deleted | AUTO | `planImpact.test.ts` "an item's last recipe is deleted: its stock stays, marked as no longer used"; `stock.test.ts:80`; `HangarSection.test.tsx:74` |
| Seeing where stock has gone | AUTO | `core/hangar/stock.test.ts:47`; `HangarSection.test.tsx:33` |
| Fixing a miscount | AUTO | `HangarSection.test.tsx:81`; PS:198 |
| Attempting to edit reserved stock | AUTO | `HangarSection.test.tsx:33`, `:43` |
| Viewing does not consume | AUTO | PS "viewing a plan and its details changes nothing" |

## production-plans

| Scenario | Status | Evidence |
|---|---|---|
| Picking a plan back up | AUTO | `serialize.test.ts:15`; `load.test.ts:26`; `startup.test.ts:85`; `steps.test.ts:32` round-trip |
| Working on two projects at once | AUTO | `core/plans/steps.test.ts` "starting and completing a step in one plan leaves the other plan's steps alone"; `Shell.test.tsx:59`; PS:108; `reservations.test.ts:56`, `:94` |
| Naming a plan | AUTO | `plans.test.ts:29`, `:34`, `:87`; PS:64, PS:283 ("80 Flycatcher", matching the spec as corrected on 2026-10-06) |
| Done steps get out of the way | AUTO | PS:225, PS:361 |
| A plan with materials missing | AUTO | PS:140 |
| Acquiring satisfies the entry without a tick | AUTO | PS:198; Acquire rows have no Start/Done buttons (`PlanView.tsx`) |
| Partial acquisition | AUTO | PS:140; `calculate.test.ts:115` |
| Starting a reaction | AUTO | `steps.test.ts:49`; PS:321 |
| Starting a step in a reserved plan | AUTO | `steps.test.ts:67` |
| A recipe is edited while its job runs | AUTO | `steps.test.ts:121`; `calculate.test.ts:274` |
| Started work is not asked for again | AUTO | `steps.test.ts:95`; `calculate.test.ts:263`; PS:207 |
| Stock arrives for a started step | AUTO | `calculate.test.ts:269` |
| Starting with too little | AUTO | `steps.test.ts:74`; PS:332 |
| Declining the warning | AUTO | PS:332; `steps.test.ts:83` |
| Batch surplus from a reserved plan | AUTO | `steps.test.ts:104` |
| A step completed in an unreserved plan | AUTO | `steps.test.ts:113` |
| Another plan uses the output of an unreserved plan | AUTO | `steps.test.ts:144`; `calculate.test.ts:294` |
| Completing without starting | AUTO | PS:349 ("Add output only"); PS "marking a not-started step done can deduct its inputs as well"; `steps.test.ts:129` |
| Undoing a completed step | AUTO | `steps.test.ts:186`; PS:361 |
| Undoing a started step | AUTO | `steps.test.ts:198`, `:213`; PS:361 |
| Undoing a step that was started short | AUTO | `steps.test.ts:206` |
| Material already spent | AUTO | `steps.test.ts:223`; PS:379 |
| Reserving a fully covered plan | AUTO | `reservations.test.ts:37`; `stock.test.ts:47`; `HangarSection.test.tsx:33` |
| Reserving across tiers | AUTO | `reservations.test.ts:43`; PS:412; `calculate.test.ts:144` |
| Another plan sees less | AUTO | `reservations.test.ts:56` |
| Reserving an incompletely covered plan | AUTO | `reservations.test.ts:63`; PS:412 |
| Components count towards the reservation | AUTO | `reservations.test.ts:49`, `:56` |
| Releasing mid-project | AUTO | `reservations.test.ts:105`; `plans.test.ts:198`; PS:412; `HangarSection.test.tsx:43` |
| A recipe change releases a reservation | AUTO | `RecipeChanges.test.tsx:79`, `:93`; `planImpact.test.ts:98` |
| Changing a variant choice on a reserved plan | AUTO | PS:271; `plans.test.ts:179` |
| Completing a reserved plan with material left in its pile | AUTO | `steps.test.ts:154`; PS:396 |
| Holding the target product does not complete a plan | AUTO | `calculate.test.ts:132`; completion is set only in `complete()` |
| Completed plans are kept for a while | AUTO | PS:108, PS:295; PS "deletes a completed plan on request" |
| A plan completed eight days ago | AUTO | `startup.test.ts:44`; `core/plans/retention.test.ts:27` |
| A plan completed yesterday | AUTO | `startup.test.ts:56`; PS:108, PS:295, PS:396; `plans.test.ts:206` |
| Leaving the application running | AUTO | PS "keeps a completed plan listed past its removal date while the application runs" |
| Picking up a long project | AUTO | PS:295, PS:207, PS:225 |
| A step completed without being started | AUTO | `steps.test.ts:129`; PS "shows a step done without starting with its done time and no start time" |
| Reverting a done step | AUTO | `steps.test.ts:186` |
| Another plan takes the material | AUTO | `reservations.test.ts:94` |
| Stock arrives | AUTO | `calculate.test.ts:138`, `:269`; `reset.test.ts:58` |
| A recipe changes | AUTO | `planImpact.test.ts:63`; `planImpact.test.ts` "reflects the change in what is still to do, without reopening done steps" |
| Deleting a reserved plan with work done | AUTO | `plans.test.ts:105`; PS:119 |
