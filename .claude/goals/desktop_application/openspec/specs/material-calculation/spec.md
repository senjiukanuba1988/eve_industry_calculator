# Material Calculation Specification

## Purpose

The arithmetic at the heart of the application: turning "I want 30 of these" into "buy this, then run these jobs in this order". Defines how recipes are expanded, how batch sizes and surpluses are handled, how material already owned reduces the work, and how ambiguity is resolved. These rules are the same wherever a calculation appears.

Throughout this capability, **available material** means the material a calculation is allowed to draw on. Which stock that actually is — general hangar stock, or a plan's own reserved pile — is defined by [Production Plans](../production-plans/spec.md) and [Hangar](../hangar/spec.md).

## Requirements

### Requirement: Recursive expansion down to base materials

Given a target recipe and a number of runs, the application SHALL work out the total quantity of each input required, and SHALL expand any required item that a recipe produces into that recipe's own inputs, repeating until only base materials remain. It SHALL report the resulting base material quantities as a single consolidated total per item.

#### Scenario: A multi-tier product

- **GIVEN** Acolyte II is made from components, some of which are planetary products made from other planetary products, and some of which are reaction products made from other reaction products
- **WHEN** the user calculates 30 runs of Acolyte II
- **THEN** every tier is expanded through to items no recipe produces
- **AND** the result lists each base material once, with the total quantity needed across the whole tree

#### Scenario: The same base material reached by several paths

- **GIVEN** two different branches of the tree both consume Tritanium
- **WHEN** the calculation completes
- **THEN** Tritanium appears once, with the two demands added together

### Requirement: Production happens in whole runs

Intermediates SHALL only be produced in whole runs. For each intermediate, the application SHALL use the smallest number of whole runs whose total output covers the demand for it.

#### Scenario: Demand smaller than one batch

- **GIVEN** a reaction yields 10,000 Tungsten Carbide per run
- **WHEN** 600 Tungsten Carbide are needed
- **THEN** the calculation calls for 1 run, producing 10,000

#### Scenario: Demand spanning several batches

- **GIVEN** a planetary recipe yields 5 units per run
- **WHEN** 12 units are needed
- **THEN** the calculation calls for 3 runs, producing 15

### Requirement: Surplus from batching is reported and reused

Where whole-run production yields more of an item than is needed, the application SHALL report the surplus as **leftover** for that item. Leftover SHALL be consumed by any later demand for that same item within the same calculation before any further runs are called for. The leftover reported for an item SHALL be what remains once the whole calculation is accounted for, and SHALL always be less than one run's output.

#### Scenario: Leftover is shown

- **GIVEN** 600 Tungsten Carbide are needed and a run yields 10,000
- **WHEN** the calculation completes
- **THEN** it reports 1 run, 10,000 produced, and 9,400 leftover

#### Scenario: Two consumers share one batch

- **GIVEN** two separate parts of the tree each need 600 Tungsten Carbide, and a run yields 10,000
- **WHEN** the calculation completes
- **THEN** it reports 1 run in total, not 2
- **AND** the leftover is 8,800

#### Scenario: Leftover does not carry between calculations

- **WHEN** a calculation reports leftover
- **THEN** that leftover exists only as a prediction within that calculation
- **AND** it becomes real stock only when the corresponding step is actually marked done

### Requirement: Available material is consumed before anything is made or bought

At every tier, the application SHALL draw on available material before calling for production or acquisition. This applies to intermediates exactly as it does to base materials: owning a part-built component SHALL remove both that component and its own inputs from the work still to do.

The one exception is the target product itself. A calculation SHALL always build the full requested quantity of its target, regardless of how much of it is already held: asking for 5 means 5 more.

#### Scenario: Partly stocked intermediate

- **GIVEN** a plan needs 10 Robotics and 4 are available
- **WHEN** the calculation completes
- **THEN** it calls for producing only 6 Robotics
- **AND** it calls only for the Reactive Metals and Consumer Electronics needed to make those 6

#### Scenario: Fully covered item

- **GIVEN** 1,000,000 Tritanium is available and 4,750 is needed
- **WHEN** the calculation completes
- **THEN** Tritanium is reported as fully covered, with nothing to acquire
- **AND** it is still shown, rather than disappearing from the result, so the user can see it was accounted for

#### Scenario: Owning the final product

- **GIVEN** a plan targets 5 X and 20 X are already held
- **WHEN** the calculation completes
- **THEN** it still calls for building 5 X
- **AND** the 20 X already held are neither counted nor reserved

### Requirement: Ambiguous intermediates are resolved by the user, not guessed

Where an item needed as an intermediate has more than one recipe, the application SHALL NOT pick one and SHALL NOT fail. It SHALL ask the user which recipe to use, presenting the variants with their labels, and SHALL remember that choice for the plan it was made in.

#### Scenario: Choosing a variant

- **GIVEN** a component of the target has two T2 Manufacturing recipes with different variant labels
- **WHEN** the calculation reaches it
- **THEN** the user is asked which variant this plan should use, with both labels shown
- **AND** the calculation proceeds with the chosen one

#### Scenario: The choice is remembered

- **WHEN** the user returns to the same plan later
- **THEN** the previously chosen variant is still in use, without being asked again
- **AND** the choice is visible on the plan, and can be changed

#### Scenario: A second variant is added later

- **GIVEN** a plan uses the only recipe for an intermediate
- **WHEN** the user adds a second T2 Manufacturing variant for that intermediate
- **THEN** the plan keeps using the recipe it was already using, as though the user had chosen it
- **AND** the user is not asked unless they choose to change it

#### Scenario: A remembered choice becomes invalid

- **WHEN** the recipe a plan had chosen for an intermediate is deleted
- **THEN** the plan flags that a new choice is needed, and asks again the next time it is viewed

### Requirement: Build order respects dependencies

The application SHALL order the production steps so that every step's inputs are either base materials or the output of a step appearing before it. The step producing the target product SHALL be last.

#### Scenario: Reactions before the manufacturing that consumes them

- **GIVEN** a reaction product is consumed by a manufacturing step
- **WHEN** the steps are listed
- **THEN** the reaction appears before the manufacturing step that consumes it

#### Scenario: A readable order within a tier

- **WHEN** several steps have no dependency on one another
- **THEN** they are presented in a stable order that does not change between viewings of the same unchanged plan

### Requirement: The calculation explains itself

For each step and each material the application reports, the user SHALL be able to see why that number is what it is: which demand it came from, how much was covered by available material, and how much is left over.

#### Scenario: Tracing a quantity

- **WHEN** the user asks why a step calls for 5 runs
- **THEN** the application shows the total demand for that item, which parts of the tree that demand came from, what was covered by available material, and the run count that demand rounds up to
