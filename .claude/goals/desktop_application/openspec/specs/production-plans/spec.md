# Production Plans Specification

## Purpose

A plan is a production project the user works through over time: a target recipe, a number of runs, and the ordered checklist of things to acquire and jobs to run. Plans are saved, several can be in flight at once, and working a plan moves real material in and out of the hangar. A plan can also set its materials aside so that no other plan counts on them.

This is the capability that turns the calculator into a tool the user lives in for a month at a time.

## Requirements

### Requirement: Plans are saved and several may run at once

A plan SHALL record: a name, the target recipe, the number of runs, the recipe chosen for any ambiguous intermediate, its reservation state and reserved material, and the progress of each of its steps. Plans SHALL persist across restarts. The application SHALL place no limit on how many plans are open at the same time.

The target recipe and the number of runs are entered when the plan is created, and SHALL NOT be changeable afterwards. Building more of the same item is done by creating another plan.

#### Scenario: Picking a plan back up

- **WHEN** the user creates a plan for 80 Flycatchers, marks two steps done, quits, and reopens the application a week later
- **THEN** the plan is listed, with those two steps still marked done and the rest still outstanding

#### Scenario: Working on two projects at once

- **WHEN** the user has one long-running plan for 80 Flycatchers and starts a second plan for 30 Acolyte II
- **THEN** both are listed and both can be worked independently
- **AND** neither plan's progress affects the other except through the material they share

#### Scenario: Naming a plan

- **WHEN** the user creates a plan
- **THEN** a name is suggested from the target and run count, for example "80 Flycatcher" (the quantity the plan makes, then the product)
- **AND** the user can rename it at any time without affecting anything else

### Requirement: A plan is a checklist of two kinds of entry

The plan view SHALL present an ordered checklist containing:

- **Acquire** entries — a base material the plan still needs and does not have, with the quantity short. These SHALL NOT be tickable by hand; they SHALL disappear on their own once the material becomes available. Base materials that available material fully covers SHALL be listed in a separate, collapsed section of covered materials, so they can be seen to be accounted for (see [Material Calculation](../material-calculation/spec.md), "Fully covered item").
- **Build** entries — run a named recipe a given number of times to produce a given quantity of an item. Each SHALL show the recipe, the number of runs, the resulting output quantity, and any leftover. These SHALL be moved by hand through **not started**, **started**, and **done**.

Acquire entries SHALL be listed together, before all build entries. Build entries SHALL appear in dependency order, with the step producing the target product last. Build entries marked done SHALL move out of the checklist into a separate, collapsed section of completed steps, which the user can expand to see them.

#### Scenario: Done steps get out of the way

- **WHEN** the user marks a build entry done
- **THEN** it leaves the checklist of outstanding work
- **AND** it can still be seen, and reverted, by expanding the completed steps section

#### Scenario: A plan with materials missing

- **GIVEN** a plan needs 4,750 Tritanium and the hangar holds none
- **WHEN** the user opens the plan
- **THEN** an Acquire entry at the top of the checklist asks for 4,750 Tritanium

#### Scenario: Acquiring satisfies the entry without a tick

- **GIVEN** an Acquire entry for 4,750 Tritanium
- **WHEN** the user pastes a hangar containing 5,000 Tritanium
- **THEN** that Acquire entry is gone the next time the plan is viewed
- **AND** the user never had to tick it

#### Scenario: Partial acquisition

- **GIVEN** an Acquire entry for 4,750 Tritanium
- **WHEN** 3,000 Tritanium becomes available
- **THEN** the entry remains, now asking for the remaining 1,750

### Requirement: Starting a step consumes its inputs

When the user marks a build entry as started, the application SHALL deduct that step's inputs — the recipe's per-run input quantities multiplied by the step's run count — from the plan's reserved material if the plan is reserved, and otherwise from general hangar stock.

#### Scenario: Starting a reaction

- **GIVEN** a step calls for 5 runs of a reaction consuming 98 Sulfuric Acid per run, and the plan is not reserved
- **WHEN** the user marks it started
- **THEN** 490 Sulfuric Acid is deducted from the hangar
- **AND** the step shows as started

#### Scenario: Starting a step in a reserved plan

- **GIVEN** the same step in a plan that has reserved its materials
- **WHEN** the user marks it started
- **THEN** the 490 Sulfuric Acid comes out of the plan's reserved pile, and general hangar stock is untouched

### Requirement: A started step is fixed in place

When a build entry is marked started, the application SHALL record on the step the recipe, run count, input quantities and output quantity as they stand at that moment, together with the quantities actually deducted. Completing or reverting the step SHALL use those recorded figures, not the recipe as it stands later. Continuous recalculation SHALL NOT change the run count of a started step, nor drop it from the checklist.

While a step is started, its expected output SHALL count as material the plan already has on its way, so that the plan does not ask for that output, or the inputs to make it, a second time.

#### Scenario: A recipe is edited while its job runs

- **GIVEN** a step for 5 runs of a reaction yielding 200 per run has been started
- **WHEN** the user edits that recipe to yield 220 per run
- **THEN** marking the step done adds 1,000, the figure recorded when it was started
- **AND** steps not yet started use the new recipe

#### Scenario: Started work is not asked for again

- **GIVEN** a step producing 10 Robotics has been started, so its inputs have left the hangar and its output has not yet arrived
- **WHEN** the plan is viewed
- **THEN** the started step is shown as started
- **AND** there is no new build entry for those 10 Robotics, and no Acquire entry for the inputs already deducted

#### Scenario: Stock arrives for a started step

- **GIVEN** a started step producing 10 Robotics
- **WHEN** the user pastes a hangar containing 10 Robotics
- **THEN** the started step remains on the checklist, still started, because the job it represents is still real

### Requirement: A short hangar warns but never blocks

If the material available to a step does not cover its inputs, the application SHALL list exactly which items are short and by how much, and SHALL start the step anyway if the user confirms. Quantities SHALL be reduced to zero and SHALL never go negative. The shortfall SHALL be recorded on the step and remain visible there.

#### Scenario: Starting with too little

- **GIVEN** a step needs 100 Sulfuric Acid and only 60 is available
- **WHEN** the user marks it started
- **THEN** the application warns that it is 40 Sulfuric Acid short
- **AND** on confirmation the step is started, Sulfuric Acid stands at zero, and the step records a shortfall of 40

#### Scenario: Declining the warning

- **WHEN** the user declines the warning
- **THEN** the step stays not started and no material is deducted

### Requirement: Completing a step yields its output

When the user marks a build entry as done, the application SHALL add its output — the recipe's output quantity multiplied by the step's run count — to the hangar.

- In an **unreserved** plan, all of it SHALL go to general hangar stock.
- In a **reserved** plan, the quantity the plan itself still needs of that item SHALL go to the plan's reserved pile, and only the surplus from whole-run batching SHALL go to general hangar stock. A reserved plan SHALL never hold more of an item than it needs.

#### Scenario: Batch surplus from a reserved plan

- **GIVEN** a reserved plan needs 1,150 of an item, and its step makes 6 runs of a recipe yielding 200 per run
- **WHEN** the user marks the step done
- **THEN** 1,150 go into the plan's reserved pile, where no other plan can draw on them
- **AND** the remaining 50 go into general hangar stock, available to any plan

#### Scenario: A step completed in an unreserved plan

- **GIVEN** the same step in a plan that is not reserved
- **WHEN** the user marks it done
- **THEN** all 1,200 go into general hangar stock, available to any plan

#### Scenario: Another plan uses the output of an unreserved plan

- **GIVEN** an unreserved plan has marked a step done, putting its output into general hangar stock
- **WHEN** another plan uses up that stock
- **THEN** the done step stays done, as a record of work carried out
- **AND** the plan, recalculating against current stock, shows a new build entry for whatever now has to be made again

#### Scenario: Completing without starting

- **WHEN** the user marks a not-started step as done directly
- **THEN** the application points out that its inputs have not been deducted, and offers either to deduct them and record the output in one action, or to record the output only

### Requirement: Step progress can be reverted

The user SHALL be able to move a step backwards. Reverting SHALL undo the material movement the forward action made. Where undoing would drive a quantity below zero, because the material has since been spent elsewhere, the application SHALL warn, clamp at zero, and record what could not be returned.

#### Scenario: Undoing a completed step

- **WHEN** the user reverts a done step back to started
- **THEN** that step's output is removed from wherever it was added

#### Scenario: Undoing a started step

- **WHEN** the user reverts a started step back to not started
- **THEN** the quantities actually deducted when it was started are returned to wherever they came from
- **AND** any shortfall recorded on the step is cleared

#### Scenario: Undoing a step that was started short

- **GIVEN** a step needing 100 Sulfuric Acid was started with only 60 available, recording a shortfall of 40
- **WHEN** the user reverts it to not started
- **THEN** 60 Sulfuric Acid is returned, not 100

#### Scenario: Material already spent

- **GIVEN** a done step whose output has since been consumed by a later step
- **WHEN** the user reverts it
- **THEN** the application warns that the output can no longer be fully removed, clamps the quantity at zero, and records what could not be removed on the reverted step, as with a shortfall

### Requirement: Reserving a plan's materials

A plan MAY reserve its materials, and the application SHALL allow this only when the available material covers everything the plan still needs — that is, when the plan has no outstanding Acquire entries. Reserving SHALL move the exact quantities the plan needs out of general stock and into the plan's own reserved pile. This SHALL include intermediates the plan is netting against, not only raw base materials.

Reserved material SHALL NOT count as available to any other plan, and SHALL NOT be shown as available in the hangar.

#### Scenario: Reserving a fully covered plan

- **GIVEN** a plan for 80 Flycatchers needs 2,000 Construction Blocks, the hangar holds 2,500, and everything else the plan needs is also covered
- **WHEN** the user reserves the plan
- **THEN** 2,000 Construction Blocks move into the plan's reserved pile
- **AND** the hangar shows 500 Construction Blocks available and 2,000 reserved by that plan

#### Scenario: Reserving across tiers

- **GIVEN** one X is made from 3 y and 2 z, and one y is made from 2 a and 2 b
- **AND** the hangar holds 2 y, 12 z, 50 a and 50 b
- **WHEN** the user reserves a plan to build 5 X
- **THEN** the plan needs 15 y and 10 z; it reserves the 2 y and 10 z held, and for the 13 y still to be made, 26 a and 26 b
- **AND** the hangar is left with 2 z, 24 a and 24 b unreserved

#### Scenario: Another plan sees less

- **GIVEN** the reservation above
- **WHEN** a second plan needing 1,000 Construction Blocks is calculated
- **THEN** it treats only 500 as available, and asks the user to acquire the other 500

#### Scenario: Reserving an incompletely covered plan

- **GIVEN** a plan still needs 4,750 Tritanium that is not available
- **WHEN** the user tries to reserve it
- **THEN** reserving is unavailable, and the application lists what is missing and by how much

#### Scenario: Components count towards the reservation

- **GIVEN** a plan needs 10 Robotics and 4 are available, with everything else covered
- **WHEN** the plan is reserved
- **THEN** those 4 Robotics are moved into the reserved pile alongside the base materials for the other 6
- **AND** no other plan can use those 4

### Requirement: Releasing a reservation

The user SHALL be able to release a plan's reservation at any time. Everything in the reserved pile — including material produced by steps already completed — SHALL return to general hangar stock.

#### Scenario: Releasing mid-project

- **GIVEN** a reserved plan has completed two steps, so its reserved pile holds both unused base materials and produced components
- **WHEN** the user releases the reservation
- **THEN** all of it becomes general hangar stock
- **AND** the plan keeps its step progress and carries on drawing from general stock

### Requirement: A reserved plan draws only on its own pile

A reserved plan SHALL count only its own reserved pile as available material, never general hangar stock. Because a reservation is made only when it covers everything, anything that changes what a reserved plan needs — editing or deleting a recipe it uses, or changing one of its variant choices — SHALL release its reservation, after a confirmation that says so. The plan then continues unreserved and can be reserved again once its needs are covered.

#### Scenario: A recipe change releases a reservation

- **GIVEN** a reserved plan, and the user edits one of its recipes so that it needs an additional material
- **WHEN** the user saves the recipe
- **THEN** the application warns that the plan is reserved and will become unreserved
- **AND** on confirmation the reserved pile returns to general hangar stock, and the plan recalculates against general stock like any unreserved plan

#### Scenario: Changing a variant choice on a reserved plan

- **WHEN** the user changes the recipe variant a reserved plan uses for an intermediate
- **THEN** the application warns that the reservation will be released, and changes nothing unless the user confirms

### Requirement: Finishing a plan

A plan SHALL complete when, and only when, its final build entry — the one producing the target product — is marked done, whether or not the plan is reserved. That step's output is added like any other step's. On completion the application SHALL release everything still held in the plan's reserved pile — the finished product included — back to general stock. The target product SHALL NOT be added a second time.

Because the target product is never netted against stock (see [Material Calculation](../material-calculation/spec.md)), every plan has a final build entry, and stock appearing in the hangar can never complete a plan.

#### Scenario: Completing a reserved plan with material left in its pile

- **GIVEN** a reserved plan whose last step is marked done, still holding 300 Tritanium it turned out not to need, because a recipe was edited after reserving
- **WHEN** the plan completes
- **THEN** the finished product, added to the reserved pile by the last step, is now general hangar stock
- **AND** the 300 Tritanium returns to general hangar stock
- **AND** the plan is marked complete

#### Scenario: Holding the target product does not complete a plan

- **GIVEN** a plan to build 5 X, with its final step not yet done
- **WHEN** the user pastes a hangar containing 20 X
- **THEN** the plan is unchanged and still calls for building 5 X

#### Scenario: Completed plans are kept for a while

- **WHEN** a plan is complete
- **THEN** it remains readable and deletable, distinguishable from plans still in progress
- **AND** it is excluded by default from the list of plans the user is working on

### Requirement: Completed plans are removed after a week

A completed plan SHALL be kept for seven days after it was completed. Each time the application starts, it SHALL remove every plan that was completed more than seven days earlier. Removing a completed plan SHALL NOT change any hangar quantity, since a completed plan holds no reservation. While a completed plan is still kept, the application SHALL show the date on which it will be removed.

#### Scenario: A plan completed eight days ago

- **GIVEN** a plan was completed eight days ago
- **WHEN** the user starts the application
- **THEN** that plan is no longer listed anywhere
- **AND** the hangar is unchanged

#### Scenario: A plan completed yesterday

- **GIVEN** a plan was completed yesterday
- **WHEN** the user starts the application
- **THEN** the plan is still listed among completed plans, showing the date six days from now on which it will be removed

#### Scenario: Leaving the application running

- **GIVEN** the application has been left open for longer than a week after a plan was completed
- **WHEN** the user looks at the completed plans
- **THEN** that plan is still listed, because removal only happens when the application starts

### Requirement: Plans and steps show when things happened

The application SHALL record, and show in the plan view, when each plan was created and, once complete, when it was completed; and for each build entry, when it was started and when it was done. Times SHALL be shown as a local date and time. Moving a step backwards SHALL clear the time of the state it leaves, and a hangar reset, which clears step progress, SHALL clear the step times with it.

#### Scenario: Picking up a long project

- **GIVEN** a plan created three weeks ago, with steps finished on different days
- **WHEN** the user opens it
- **THEN** the plan shows the date and time it was created
- **AND** each started step shows when it was started, and each done step, in the collapsed section of completed steps, shows when it was started and when it was done

#### Scenario: A step completed without being started

- **WHEN** the user marks a not-started step done directly
- **THEN** the step shows when it was done, and no start time

#### Scenario: Reverting a done step

- **WHEN** the user reverts a done step back to started
- **THEN** its done time is cleared, and its start time is kept

### Requirement: Plans recalculate continuously

A plan's outstanding entries SHALL always reflect the current recipes, the material currently available to it, and the steps already done. The user SHALL NOT have to ask for a recalculation. Steps already marked done SHALL stay done.

#### Scenario: Another plan takes the material

- **GIVEN** an unreserved plan counting on 1,000 Construction Blocks in general stock
- **WHEN** another plan reserves 2,000 of the 2,500 held
- **THEN** the first plan shows an Acquire entry for the 500 it is now short

#### Scenario: Stock arrives

- **GIVEN** a plan with build steps producing an intermediate it does not have
- **WHEN** the user pastes a hangar containing enough of that intermediate
- **THEN** those build steps, where not yet started, are gone from the checklist, and so are the not-yet-started steps producing their inputs

#### Scenario: A recipe changes

- **WHEN** a recipe the plan uses gains an input
- **THEN** the plan's outstanding steps and Acquire entries reflect it immediately
- **AND** steps already marked done are not reopened

### Requirement: Deleting a plan

Deleting a plan SHALL release its reserved material back to general hangar stock. It SHALL NOT return material consumed by steps already started, and SHALL NOT remove material produced by steps already completed.

#### Scenario: Deleting a reserved plan with work done

- **GIVEN** a reserved plan that has started one step and completed another
- **WHEN** the user deletes it and confirms
- **THEN** its reserved pile returns to the hangar
- **AND** the material consumed by the started step stays spent
- **AND** the output of the completed step stays in the hangar
