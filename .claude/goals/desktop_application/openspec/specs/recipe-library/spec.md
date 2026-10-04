# Recipe Library Specification

## Purpose

How the user records the ways things are made. One shape of record covers manufacturing, reactions and planetary industry, because all three are structurally the same: a set of inputs consumed per run, yielding a quantity of one product per run. Also covers the entry experience, which is where most of the user's typing happens.

## Requirements

### Requirement: What a recipe records

A recipe SHALL consist of:

- the **product**: exactly one item it produces
- the **recipe type**: one of T1 Manufacturing, T2 Manufacturing, Reaction, or Planetary Industry
- an optional **variant label**, free text, used to tell several recipes for the same product apart
- the **output quantity**: how many units of the product one run yields, a whole number of at least 1
- optional **notes**, free text
- one or more **inputs**, each naming an item and the whole-number quantity of it consumed per run, at least 1

#### Scenario: A batch-output reaction

- **WHEN** the user records a reaction producing 10,000 units per run from 98 Rolled Tungsten Alloy and 98 Sulfuric Acid
- **THEN** the recipe is saved with an output quantity of 10,000
- **AND** every calculation treats one run of it as consuming 98 of each input and yielding 10,000 of the product

#### Scenario: A recipe with no inputs

- **WHEN** the user tries to save a recipe with no input rows
- **THEN** the save is rejected, stating that a recipe must consume at least one item

#### Scenario: Non-positive quantities

- **WHEN** the user enters an output quantity or an input quantity of zero or less
- **THEN** the save is rejected, identifying the offending field

### Requirement: One recipe per product, except T2 Manufacturing

The application SHALL allow at most one recipe per product item, except for recipe type T2 Manufacturing, where a product MAY have any number of recipes. Where a product has several, each SHALL carry a variant label, and those labels SHALL be distinct from one another. All recipes for one product SHALL share the same recipe type, so a product with several recipes has only T2 Manufacturing recipes.

#### Scenario: A second recipe for a planetary product

- **GIVEN** a Planetary Industry recipe already exists for Robotics
- **WHEN** the user tries to save a second recipe for Robotics
- **THEN** it is rejected, stating that only T2 Manufacturing products may have more than one recipe, and naming the existing recipe

#### Scenario: A second T2 variant

- **GIVEN** a T2 Manufacturing recipe for Acolyte II exists with the variant label "Accelerant Decryptor"
- **WHEN** the user saves another T2 Manufacturing recipe for Acolyte II with the variant label "Symmetry Decryptor"
- **THEN** both are kept, and both appear wherever a recipe for Acolyte II can be chosen

#### Scenario: Variants that cannot be told apart

- **GIVEN** a T2 Manufacturing recipe for Acolyte II exists with the variant label "Accelerant Decryptor"
- **WHEN** the user saves another T2 Manufacturing recipe for Acolyte II with an empty variant label, or with the same label
- **THEN** it is rejected, stating that each variant needs its own distinct label

#### Scenario: Mixing recipe types for one product

- **GIVEN** a T1 Manufacturing recipe exists for an item
- **WHEN** the user tries to save a T2 Manufacturing recipe for the same item
- **THEN** it is rejected, stating that all recipes for one product must be of the same type, and naming the existing recipe

#### Scenario: Adding a second variant when the first has no label

- **GIVEN** a single T2 Manufacturing recipe for Acolyte II exists with no variant label
- **WHEN** the user saves a second T2 Manufacturing recipe for Acolyte II
- **THEN** the form asks, in place, for a label for the existing recipe as well as the new one
- **AND** both are saved together once their labels are filled in and distinct, without the user leaving the form

### Requirement: Entering item names with autocomplete

While the user types an item name — for the product or for any input row — the application SHALL suggest matching existing items as they type, showing each suggestion's category alongside its name. Choosing a suggestion SHALL bind that field to that existing item. There SHALL NOT be a separate step the user must trigger to resolve typed names.

#### Scenario: Matching an existing item

- **WHEN** the user types "Robo" into an input row
- **THEN** items whose names contain that text are offered, each with its category
- **AND** choosing Robotics binds the row to the existing Robotics item

#### Scenario: Creating an item inline

- **WHEN** the user types a name no existing item matches
- **THEN** the application offers to create an item with that name, with an optional category chosen there and then
- **AND** accepting creates the item and binds the row to it, without leaving the recipe form

#### Scenario: Saving before everything resolves

- **WHEN** the product field or any input row still holds typed text that is not bound to a real item
- **THEN** saving is unavailable, and the unresolved rows are marked as the reason

### Requirement: Recipe validation

The application SHALL reject a recipe that is internally contradictory, explaining which rule it breaks.

#### Scenario: The same input twice

- **WHEN** the user adds two input rows for the same item
- **THEN** the save is rejected, and the application offers to combine them into a single row with the quantities added together

#### Scenario: A product consuming itself

- **WHEN** the user lists the recipe's own product among its inputs
- **THEN** the save is rejected, stating that a recipe cannot consume its own product

#### Scenario: A circular chain

- **GIVEN** recipes exist such that A is made from B, and B is made from C
- **WHEN** the user saves a recipe making C out of A
- **THEN** the save is rejected, showing the chain A to B to C to A that it would create

### Requirement: Browsing the library

The Recipes section SHALL list recipes showing the product name, variant label, recipe type, and output quantity per run. The list SHALL be narrowable by recipe type, by the product's category, and by a search on part of the product name.

#### Scenario: Finding all ship recipes

- **WHEN** the user filters by the category "Ships"
- **THEN** only recipes whose product belongs to that category are listed

#### Scenario: Searching by name

- **WHEN** the user searches for "acol"
- **THEN** every recipe whose product name contains that text is listed, regardless of type or category

### Requirement: Changing a recipe that plans depend on

Because plans recalculate against the current recipes, editing or deleting a recipe changes what open plans still have to do. The application SHALL make that consequence visible before it happens.

#### Scenario: Editing a recipe an open plan uses

- **WHEN** the user saves a change to a recipe that an incomplete plan depends on
- **THEN** the application names the affected plans and asks for confirmation before saving
- **AND** on confirmation, those plans reflect the change the next time they are viewed

#### Scenario: Editing a recipe a reserved plan uses

- **WHEN** the user saves a change to a recipe that a reserved plan depends on
- **THEN** the confirmation names the reserved plans and states that their reservations will be released
- **AND** on confirmation, each of those plans' reserved pile returns to general hangar stock and the plan continues unreserved
- **AND** declining leaves both the recipe and the reservations unchanged

#### Scenario: Deleting a recipe an open plan targets

- **WHEN** the user deletes a recipe that is the target of an incomplete plan
- **THEN** the deletion is rejected, naming those plans
- **AND** the user is told to complete or delete those plans first

#### Scenario: Deleting a recipe an open plan merely uses

- **WHEN** the user deletes a recipe that an incomplete plan uses as an intermediate step, but does not target
- **THEN** the application names those plans, states the consequence for them, and asks for confirmation
- **AND** where it was the item's only recipe, the stated consequence is that the item becomes a base material those plans must acquire instead
- **AND** where other variants of it remain, the stated consequence is that those plans will have to choose another variant
- **AND** where any of those plans is reserved, the confirmation also states that its reservation will be released, as when editing a recipe it uses
