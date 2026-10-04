# Hangar Specification

## Purpose

The application's record of what the player currently owns. Unlike the web version, where hangar contents were pasted fresh for every calculation and never kept, the desktop application owns this record over time: production steps draw material out of it and put material back into it, and plans set material aside in it. That makes it state the user has to be able to see, correct, and wipe clean.

## Requirements

### Requirement: One saved hangar

The application SHALL maintain exactly one hangar: a persisted record of item and quantity, representing everything the user currently owns that the application cares about. It SHALL survive restarts. There SHALL NOT be multiple hangars, per-character or per-station stock, or location information of any kind.

#### Scenario: Stock survives a restart

- **WHEN** the user closes the application and reopens it
- **THEN** the hangar holds exactly what it held before, including every plan's reserved material

### Requirement: Adding stock by pasting

The application SHALL accept text copied out of the game's inventory or assets window and SHALL **add** the quantities it finds to the existing stock. A paste SHALL NOT replace or clear anything.

For each line, the application SHALL take the first token consisting only of digits, dots and commas as the quantity, treat the text before it as the item name, and ignore everything after it.

#### Scenario: Inventory window format

- **WHEN** the user pastes a line reading `Zydrine` then a tab then `296,949`
- **THEN** 296,949 Zydrine is added to the hangar

#### Scenario: Assets window format with trailing columns

- **WHEN** the user pastes a line reading `Sulfuric Acid` then `98` then `Mineral` then `9.80 m3` then an ISK value
- **THEN** 98 Sulfuric Acid is added, and the trailing columns are ignored

#### Scenario: Names containing digits

- **WHEN** the user pastes a line for `F77 Compact Co-Processor` with a quantity of 3
- **THEN** the item name is read as `F77 Compact Co-Processor` and the quantity as 3, because the digits inside the name are not a standalone numeric token

#### Scenario: Pasting the same list twice

- **WHEN** the user pastes the same text a second time
- **THEN** the quantities are added again, doubling that stock
- **AND** this is the specified behaviour: resynchronising with the game is done by resetting and pasting afresh, not by pasting over the top

#### Scenario: A line with no quantity

- **WHEN** a pasted line contains no standalone numeric token
- **THEN** that line is skipped, and it is listed among the skipped lines in the paste summary

### Requirement: Only items the application knows what to do with are kept

The application SHALL ignore any pasted line whose item is neither an input to any recipe nor the product of any recipe. Such items SHALL NOT be stored. This includes items that exist in the catalog but that no recipe currently references.

#### Scenario: Pasting a whole hangar

- **GIVEN** the user pastes the full contents of a station hangar, containing modules, ammunition and ships alongside production materials
- **WHEN** the paste is processed
- **THEN** only the items that appear in some recipe, as an input or as a product, are added
- **AND** the rest are reported as ignored, with the reason

#### Scenario: An item that becomes relevant later

- **GIVEN** an item was ignored on an earlier paste because no recipe referenced it
- **WHEN** the user later creates a recipe that uses it
- **THEN** the item is not retroactively added to the hangar
- **AND** the user has to paste it again for it to be counted

#### Scenario: The paste summary

- **WHEN** a paste completes
- **THEN** the application shows what was added, with quantities, and what was ignored or skipped, with the reason for each
- **AND** the summary can be dismissed without undoing the paste

### Requirement: Resetting the hangar

The application SHALL offer a reset that clears all hangar stock, releases every plan's reserved material, and clears the step progress — both started and done — of every incomplete plan. Plans themselves SHALL survive a reset, keeping their name, target recipe, run count, and chosen recipe variants. Completed plans SHALL be left exactly as they are; they are a record of finished work and hold no reservation.

The application SHALL NOT refuse a reset because steps are in progress. It SHALL state plainly what will be lost and require confirmation.

#### Scenario: Resyncing with the game

- **GIVEN** three plans exist, one of them with reserved material and half its steps ticked off
- **WHEN** the user resets the hangar and confirms
- **THEN** the hangar holds nothing
- **AND** no plan holds reserved material
- **AND** every step of every plan is back to not started
- **AND** all three plans are still listed, still targeting the same recipe and run count

#### Scenario: Completed plans are untouched

- **GIVEN** a completed plan exists alongside incomplete ones
- **WHEN** the user resets the hangar and confirms
- **THEN** the completed plan is still complete, with its steps still marked done

#### Scenario: Picking a plan back up after a reset

- **GIVEN** the user reset the hangar and pasted the real contents of their stations back in, which include components produced by steps they had previously ticked off
- **WHEN** they open one of their plans
- **THEN** the steps producing those components no longer appear, because the components are now available stock
- **AND** the plan can be reserved and worked from where it actually stands

### Requirement: Seeing and correcting stock

The Hangar section SHALL list every item held, showing the quantity available, the quantity reserved, and the total. Where a quantity is reserved, the plans holding it SHALL be identifiable. The list SHALL be searchable by item name and narrowable by category.

The user SHALL be able to correct an available quantity by hand, and to remove an item's stock entirely. Reserved quantities SHALL NOT be editable directly; the reservation has to be released first. There is no separate action for adding a new item by hand; pasting, including a single typed line such as `Tritanium 500`, is the way stock for a new item enters the hangar.

Stock SHALL NOT be removed because the recipes referencing an item were deleted. Where an item held in the hangar is no longer referenced by any recipe, the Hangar section SHALL mark it as such, so the user can remove it if they wish.

#### Scenario: An item's last recipe is deleted

- **GIVEN** the hangar holds 500 of an item, and the only recipe referencing it is deleted
- **WHEN** the user looks at the hangar
- **THEN** the 500 are still there, marked as not used by any recipe

#### Scenario: Seeing where stock has gone

- **GIVEN** 2,500 Construction Blocks are held and a plan has reserved 2,000 of them
- **WHEN** the user looks at the hangar
- **THEN** Construction Blocks show as 500 available, 2,000 reserved, 2,500 total
- **AND** the plan holding the reservation is named

#### Scenario: Fixing a miscount

- **WHEN** the user edits an available quantity by hand
- **THEN** the new quantity takes effect immediately, and every plan reflects it

#### Scenario: Attempting to edit reserved stock

- **WHEN** the user tries to change a quantity that is reserved
- **THEN** the application explains that the material is reserved, names the plan, and offers to release that reservation

### Requirement: Stock only changes through explicit actions

The hangar SHALL change only as a result of: pasting, resetting, a manual correction, starting a plan step, completing a plan step, reverting a plan step, reserving a plan, releasing a reservation (including a release the user confirmed as part of a recipe change or a variant change), completing a plan, or deleting a plan. Merely opening, viewing or recalculating a plan SHALL NOT change any quantity.

#### Scenario: Viewing does not consume

- **WHEN** the user opens a plan, reads its checklist, and closes it again
- **THEN** no hangar quantity has changed
