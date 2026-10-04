# Item Catalog Specification

## Purpose

The vocabulary the rest of the application is written in: the items that can be produced, consumed and held, and the user-defined categories that organise them. Also defines what makes an item a *base material* — a property that is derived, never declared.

## Requirements

### Requirement: Items

The application SHALL maintain a catalog of items. Each item SHALL have a name, unique across the catalog and compared ignoring case and surrounding whitespace, and MAY belong to one category.

#### Scenario: Browsing the catalog

- **WHEN** the user opens the item catalog
- **THEN** every item is listed with its category
- **AND** the list can be narrowed by category and by a search on part of the name

#### Scenario: Renaming an item

- **WHEN** the user renames an item
- **THEN** the new name is used everywhere that item appears — in recipes, in hangar stock, and in plan steps

#### Scenario: Renaming to a name already in use

- **WHEN** the user renames an item to a name another item already has
- **THEN** the rename is rejected, naming the conflicting item
- **AND** neither item changes

#### Scenario: Changing an item's category

- **WHEN** the user assigns an item to a different category, or to no category
- **THEN** the change takes effect immediately for every filter and grouping that uses categories

#### Scenario: Deleting an unused item

- **WHEN** the user deletes an item that no recipe references and that holds no hangar stock
- **THEN** the item is removed from the catalog

#### Scenario: Deleting an item a recipe depends on

- **WHEN** the user deletes an item that is the product or an input of at least one recipe
- **THEN** the deletion is rejected, naming the recipes that reference it
- **AND** the item remains unchanged

#### Scenario: Deleting an item that holds stock

- **WHEN** the user deletes an item that no recipe references but that still holds hangar stock
- **THEN** the deletion is rejected, stating the quantity held
- **AND** the user is told to remove its stock in the Hangar section first

### Requirement: Categories

The application SHALL let the user create, rename and delete categories. Category names SHALL be unique, compared ignoring case and surrounding whitespace. Categories are organisational only and SHALL NOT affect any calculation.

#### Scenario: Creating a category

- **WHEN** the user creates a category with a name not already in use
- **THEN** it is available immediately wherever a category can be chosen

#### Scenario: Creating a duplicate category

- **WHEN** the user creates a category with a name that already exists
- **THEN** it is rejected with that reason
- **AND** no second category is created

#### Scenario: Deleting an empty category

- **WHEN** the user deletes a category no item belongs to
- **THEN** it is removed

#### Scenario: Deleting a category in use

- **WHEN** the user deletes a category that items belong to
- **THEN** the deletion is rejected, stating how many items use it
- **AND** the user is offered the alternative of moving those items out of the category first

### Requirement: Base materials are derived, never tagged

An item SHALL be treated as a base material exactly when no recipe produces it. The application SHALL NOT offer or store a manual "this is a base material" flag, and SHALL re-derive the distinction whenever recipes change.

#### Scenario: An item with no recipe

- **WHEN** a calculation reaches an item that no recipe produces
- **THEN** that item is reported as a base material to acquire, and is not expanded any further

#### Scenario: A base material gains a recipe

- **GIVEN** Tungsten Carbide is currently treated as a base material, because no recipe produces it
- **WHEN** the user adds a reaction recipe that produces Tungsten Carbide
- **THEN** every subsequent calculation expands it into that reaction's inputs instead of listing it as something to acquire

#### Scenario: An intermediate loses its recipe

- **WHEN** the only recipe producing an item is deleted
- **THEN** that item is treated as a base material again from that point on

### Requirement: Missing recipes are visible, not silent

Because a base material is simply an item nothing produces, a recipe the user has not got round to entering looks identical to a raw material. The application SHALL make the difference easy to spot, by offering, on any item presented as a base material, a direct action to create a recipe for it.

#### Scenario: Spotting a forgotten recipe

- **GIVEN** the user has entered an Acolyte II recipe but not yet the recipe for one of its components
- **WHEN** a calculation lists that component among the base materials to acquire
- **THEN** the entry offers a direct action to create a recipe for it
- **AND** taking that action and saving the recipe causes later calculations to expand it instead
