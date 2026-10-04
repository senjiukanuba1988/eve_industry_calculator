# Project Context

## Purpose

A single-user desktop tool for planning EVE Online industry. It answers three questions:

1. **What do I need?** Given something I want to build and how many runs of it, what raw materials does that come to once every component, reaction product and planetary product in the chain is expanded?
2. **What do I actually do, in what order?** Not just the shopping list, but the ordered set of production jobs — run this reaction five times, then this manufacturing job six times — down to the finished product.
3. **Where am I in it?** Which of those jobs have I already kicked off, which are finished, and what does that leave me still needing?

It exists because EVE's own industry UI shows one job at a time, while a Tech 2 build is a tree of jobs spanning several production tiers and, for a large project, several weeks of real time.

## Who uses it

One player, on their own machine, alongside the game. No accounts, no sharing, no server.

## Product principles

- **The user's stock is the centre of the model.** Every number the app shows is relative to what the player currently owns. A material list that ignores the 2,500 Construction Blocks already sitting in the hangar is wrong.
- **The app tracks reality, it does not enforce it.** It cannot see into the game. When the player says a job started, it believes them, even when its own numbers say there wasn't enough material. It warns; it does not block.
- **Long projects are the normal case.** A plan is something returned to over weeks, not a calculation thrown away when the window closes.
- **Recalculating is free; remembering is expensive.** Wherever a fact can be derived from current state (is this a base material? is this step still needed?), it is derived rather than stored and kept in sync.
- **The data belongs to the user.** It lives in readable files they can open, back up and copy. Replacing the application must never put it at risk.

## Terminology

| Term | Meaning |
|---|---|
| **Item** | Anything that can be held: a mineral, a planetary product, a reaction product, a finished ship or drone. |
| **Category** | A user-defined grouping of items (e.g. Minerals, Drones, Ships). Purely for organisation and filtering. |
| **Recipe** | One way of producing an item: a set of inputs consumed and a quantity of product yielded, per run. Covers manufacturing, reactions and planetary industry alike. |
| **Run** | One execution of a recipe, consuming its inputs once and yielding its output quantity once. |
| **Base material** | An item no recipe produces — the leaves of the tree, the things that have to be bought or mined. |
| **Intermediate** | An item that some recipe produces and that is consumed on the way to the final product. |
| **Hangar** | The app's record of what the player currently owns. |
| **Plan** | A saved production project: a target recipe, a run count, and the checklist of jobs working towards it. |
| **Reservation** | Materials set aside for one plan, invisible as available stock to every other plan. |

> **Note on "recipe" vs "blueprint".** In-game these are three different objects — blueprints for manufacturing, formulas for reactions, schematics for planetary industry. The spec uses one neutral word, **recipe**, because the app treats all three identically. If the preferred UI wording is "blueprint" throughout, that is a labelling change and nothing in this spec depends on it.

## Explicitly out of scope

- Prices, ISK cost, profitability. Nothing in this app knows what anything is worth.
- Market data, ESI, or any other connection to the live game.
- Job timers, facility slots, character skills, material/time efficiency research levels.
- Multiple characters, multiple stations, multiple hangars.
- Choosing where an item comes from. Anything with a recipe is planned as a build; whether stock was built, bought or found makes no difference, and buying an intermediate is handled by adding it to the hangar, after which the steps it makes unnecessary drop out of the plan.
- Merging duplicate items created by typos (autocomplete item entry is the mitigation; a merge operation is not specified).
- Fractional per-run material consumption from facility bonuses. Per-run input quantities remain whole numbers, entered pre-rounded up by the user, as today. This is deliberate and permanent, not a stopgap: rounding up per run makes every calculation a worst case, so any rounding error means using slightly less than planned, never running short.
