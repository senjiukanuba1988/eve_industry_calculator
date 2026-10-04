# Application Shell Specification

## Purpose

How the application presents itself as a whole: one window, four areas of work, no navigation between pages. Covers the framing every other capability appears inside, and the behaviours that apply everywhere — confirming destructive actions, surfacing failures, and running without a network.

## Requirements

### Requirement: Single-window workspace

The application SHALL present all of its functionality in one window, consisting of a persistent sidebar and a main panel. The sidebar SHALL offer four sections — **Plans**, **Recipes**, **Hangar** and **Items** — and the main panel SHALL show the content of whichever section is selected. The application SHALL NOT require the user to navigate away from one screen to reach another in order to move between working a plan, editing a recipe, and inspecting stock.

The **Items** section SHALL hold the item catalog and the management of categories, as described in [Item Catalog](../item-catalog/spec.md).

#### Scenario: Starting with existing plans

- **WHEN** the user opens the application and at least one plan is not yet complete
- **THEN** the Plans section is selected
- **AND** the main panel lists the incomplete plans to choose from
- **AND** the application does not remember which plan was open when it was last closed

#### Scenario: Starting with recipes but no open plans

- **WHEN** the user opens the application, recipes exist, and no plan is incomplete
- **THEN** the Plans section is selected
- **AND** the main panel offers to create a plan, with the recipe library to choose a target from

#### Scenario: Starting with nothing

- **WHEN** the user opens the application for the first time, with no recipes and no plans
- **THEN** the Plans section is selected
- **AND** the main panel explains that a plan is created from a recipe, and offers a direct route to creating the first recipe

#### Scenario: Returning to a section

- **WHEN** the user is working a plan, switches to Recipes to check something, and switches back to Plans
- **THEN** the same plan is shown, in the same state, without having to find it again
- **AND** this holds for as long as the application stays open; nothing about what was on screen is kept once it is closed

### Requirement: Jumping between related things

The application SHALL let the user move directly from an object to the things it relates to, without searching for them by hand.

#### Scenario: From a recipe to a new plan

- **WHEN** the user is viewing a recipe
- **THEN** an action is offered to start a plan from it, which switches to Plans with that recipe already chosen as the target

#### Scenario: From a plan step to its recipe

- **WHEN** the user is working a plan and wants to see the detail of the recipe behind one of its build steps
- **THEN** an action on that step opens that recipe for viewing or editing

#### Scenario: From a material to its stock

- **WHEN** a plan shows that an item is still needed
- **THEN** an action on that item shows its current hangar position — available, reserved, and by which plans

### Requirement: Offline, single-user operation

The application SHALL run entirely on the local machine. It SHALL NOT require an account, a login, or a network connection for any feature.

#### Scenario: No network available

- **WHEN** the machine has no network connection
- **THEN** every feature of the application works normally

### Requirement: Destructive actions are confirmed and explained

Before an action that discards data or cannot be undone, the application SHALL ask for confirmation and SHALL state the specific consequences in terms of what the user will lose, rather than in generic wording.

#### Scenario: Resetting the hangar

- **WHEN** the user triggers a hangar reset
- **THEN** the confirmation states that all stock will be cleared, that every plan's reserved materials will be released, and that the step progress of every incomplete plan will be cleared
- **AND** nothing changes unless the user confirms

#### Scenario: Deleting a plan that holds reservations

- **WHEN** the user deletes a plan with reserved materials
- **THEN** the confirmation names the plan and states that its reserved materials will return to the hangar
- **AND** nothing changes unless the user confirms

### Requirement: Failures are explained in place

When an action cannot be carried out, the application SHALL explain why, in the place the user attempted it, naming the specific obstacle. It SHALL NOT discard the user's unsaved input as a side effect of a failure.

#### Scenario: Save rejected by a validation rule

- **WHEN** the user tries to save a recipe that violates a rule
- **THEN** the reason is shown next to the field or row at fault
- **AND** everything else the user had typed is still there to correct
