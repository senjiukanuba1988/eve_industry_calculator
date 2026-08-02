# Future Improvements

Things explicitly deferred from current goals - not forgotten, just out of scope for now. Revisit when picking up new goals or doing major refactors.

## Reaction recipe rounding (fractional per-run quantities)

**Status:** Out of scope for `2_material_summary` and `5_make_production_ready` (declared 2026-08-02).

Facility bonuses make per-run reaction material consumption non-integer (e.g. Tungsten Carbide's base recipe of 100 Rolled Tungsten Alloy + 100 Sulfuric Acid -> 10000 output actually consumes 97.8 of each per run in a bonused facility). `recipe_inputs.input_quantity` is an integer column, so today these are stored pre-rounded-up to the nearest integer (e.g. 98), which:

- Loses precision (98 vs the true 97.8)
- Doesn't scale correctly for a batch of N runs, since round-up-per-run != round-up-once-for-N runs

**Decided (2026-08-02):** treat this as acceptable for now - rounding up is the safe direction (never runs short) and matches how the user already plans production. Not worth blocking current goals on.

**Future fix options:**
- Add a float/decimal quantity column with explicit rounding semantics applied at calculation time (round up once for the full batch of N runs, not per run), or
- Store the base (unbonused) recipe and the facility modifier separately, so the same recipe row can serve multiple facility configurations and rounding happens once at explosion time.

## Item merging (duplicate items, e.g. typo'd names)

**Status:** Noted 2026-08-03, not scheduled to any goal yet.

Items are currently matched/created by exact name (see `ItemsController::resolve`/`create`), so a typo produces a second, separate item row rather than reusing the existing one - discovered when the same in-game item ended up entered twice under a misspelled and a correct name. There's currently no way to consolidate: `items` has no merge operation, and deleting the duplicate outright doesn't work once anything references it (`recipe_inputs.input_item_id` / `recipes.product_item_id` are `ON DELETE RESTRICT`).

**Future fix:** add a "merge items" operation - pick a surviving item and one or more duplicates, repoint every `recipes.product_item_id` and `recipe_inputs.input_item_id` referencing a duplicate over to the survivor, then delete the duplicates. Needs thought on conflict handling (e.g. if repointing an input would create a duplicate input row within the same recipe, which `recipe_inputs`' `(recipe_id, input_item_id)` unique index would reject - probably needs to merge quantities in that case rather than fail).
