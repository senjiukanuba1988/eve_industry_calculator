// Saving a recipe from the recipe form (recipe-library spec, "What a recipe records",
// "One recipe per product, except T2 Manufacturing" and "Recipe validation"). Every rule is
// checked against the library as it would be after the save, and every problem is tied to
// the field it is about, so the form can show it there.

import type { AppData, Plan, Recipe, RecipeRef, RecipeType } from "../data/model";
import { nameKey } from "../data/names";
import { findCycles } from "../data/validate";
import { refuse, type Refusal } from "../refusal";
import { planReaches, releaseChanged } from "./planImpact";

/** What the form holds when the user saves. Item names are bound to catalog items by the form. */
export interface RecipeDraft {
  product: string;
  type: RecipeType;
  /** Free text; trimmed, and empty means no label. */
  variant?: string;
  /** As entered; anything but a whole number of at least 1 is a problem. */
  output: number;
  notes?: string;
  /** The input rows in the form's order, duplicates included. */
  inputs: ReadonlyArray<{ item: string; quantity: number }>;
}

export interface SaveRecipeOptions {
  /** The recipe being edited; absent when creating a new one. */
  original?: RecipeRef;
  /**
   * The label for the product's existing, unlabelled T2 recipe, when this save adds a second
   * variant (the form asks for it in place after an `existingNeedsLabel` problem).
   */
  existingLabel?: string;
}

/** Where the form shows a problem. */
export type ProblemField = "product" | "type" | "variant" | "existingLabel" | "output" | "inputs" | { rows: number[] };

export type RecipeProblem = { field: ProblemField } & (
  | { kind: "unknownItem"; item: string }
  | { kind: "notPositiveWhole" }
  | { kind: "noInputs" }
  /** The same item in several rows; `total` is set when their quantities can be added up. */
  | { kind: "duplicateInput"; item: string; total?: number }
  | { kind: "consumesItself" }
  /** The product already has a recipe of another type. */
  | { kind: "mixedTypes"; existing: RecipeRef; existingType: RecipeType }
  /** The product already has a recipe, and only T2 Manufacturing products may have several. */
  | { kind: "onlyT2MayHaveSeveral"; existing: RecipeRef }
  /** The product has other T2 recipes, so this one needs a label. */
  | { kind: "labelNeeded" }
  /** The label is already used by another recipe for the product, or by the existing recipe being labelled now. */
  | { kind: "labelNotDistinct"; label: string }
  /** The product's one existing T2 recipe has no label; it needs one before a second variant can be added. */
  | { kind: "existingNeedsLabel"; existing: RecipeRef }
  /** Saving would make the product needed, through these recipes, to make itself: A → B → C → A. */
  | { kind: "cycle"; chain: string[] }
  /** Changing the product would take the recipe away from plans that build it. */
  | { kind: "targetedByPlans"; plans: string[] }
  | { kind: "notFound"; recipe: RecipeRef }
);

/** Saves the draft as a new recipe, or in place of `options.original`, or refuses with every problem found. */
export function saveRecipe(data: AppData, draft: RecipeDraft, options: SaveRecipeOptions = {}): AppData | Refusal<RecipeProblem[]> {
  const problems: RecipeProblem[] = [];
  const problem = (p: RecipeProblem) => problems.push(p);

  const { original } = options;
  if (original && !data.recipes.some((r) => sameRecipe(r, original))) {
    return refuse([{ field: "product", kind: "notFound", recipe: original }]);
  }
  const others = data.recipes.filter((r) => !original || !sameRecipe(r, original));
  const variant = text(draft.variant);
  const items = new Set(allItems(data));

  // The record itself.
  if (!items.has(draft.product)) {
    problem({ field: "product", kind: "unknownItem", item: draft.product });
  }
  if (!isPositiveWhole(draft.output)) {
    problem({ field: "output", kind: "notPositiveWhole" });
  }
  if (draft.inputs.length === 0) {
    problem({ field: "inputs", kind: "noInputs" });
  }
  const rowsOf = new Map<string, number[]>();
  draft.inputs.forEach((row, i) => {
    if (!items.has(row.item)) {
      problem({ field: { rows: [i] }, kind: "unknownItem", item: row.item });
    }
    if (!isPositiveWhole(row.quantity)) {
      problem({ field: { rows: [i] }, kind: "notPositiveWhole" });
    }
    if (row.item === draft.product) {
      problem({ field: { rows: [i] }, kind: "consumesItself" });
    }
    rowsOf.set(row.item, [...(rowsOf.get(row.item) ?? []), i]);
  });
  for (const [item, rows] of rowsOf) {
    if (rows.length > 1) {
      const quantities = rows.map((i) => draft.inputs[i]!.quantity);
      const total = quantities.every(isPositiveWhole) ? quantities.reduce((a, b) => a + b, 0) : undefined;
      problem({ field: { rows }, kind: "duplicateInput", item, total: total !== undefined && isPositiveWhole(total) ? total : undefined });
    }
  }

  // Its place among the product's other recipes.
  const siblings = others.filter((r) => r.product === draft.product);
  let existingLabel: { recipe: Recipe; label: string } | undefined;
  const mixed = siblings.find((r) => r.type !== draft.type);
  if (mixed) {
    problem({ field: "type", kind: "mixedTypes", existing: ref(mixed), existingType: mixed.type });
  } else if (siblings.length > 0 && draft.type !== "T2 Manufacturing") {
    problem({ field: "product", kind: "onlyT2MayHaveSeveral", existing: ref(siblings[0]!) });
  } else if (siblings.length > 0) {
    // T2 variants: every recipe for the product needs its own label.
    const unlabelled = siblings.find((r) => r.variant === undefined);
    const labels = siblings.filter((r) => r.variant !== undefined).map((r) => r.variant!);
    if (unlabelled) {
      const label = text(options.existingLabel);
      if (label === undefined) {
        problem({ field: "existingLabel", kind: "existingNeedsLabel", existing: ref(unlabelled) });
      } else if (variant !== undefined && nameKey(label) === nameKey(variant)) {
        problem({ field: "existingLabel", kind: "labelNotDistinct", label });
      } else {
        existingLabel = { recipe: unlabelled, label };
      }
    }
    if (variant === undefined) {
      problem({ field: "variant", kind: "labelNeeded" });
    } else {
      const taken = labels.find((l) => nameKey(l) === nameKey(variant));
      if (taken !== undefined) {
        problem({ field: "variant", kind: "labelNotDistinct", label: taken });
      }
    }
  }

  // Taking the recipe away from plans that build its product.
  if (original && original.product !== draft.product && !others.some((r) => r.product === original.product)) {
    const plans = data.plans.filter((p) => p.completed === undefined && p.target.product === original.product).map((p) => p.name);
    if (plans.length > 0) {
      problem({ field: "product", kind: "targetedByPlans", plans });
    }
  }

  const recipe: Recipe = {
    product: draft.product,
    variant,
    type: draft.type,
    output: draft.output,
    notes: text(draft.notes),
    inputs: new Map(draft.inputs.map((row) => [row.item, row.quantity])),
  };

  // Cycles only matter once the record itself is sound; they are reported on the input that closes them.
  if (problems.length === 0) {
    for (const cycle of findCycles([...others, recipe])) {
      const chain = startingAfter(cycle, draft.product);
      if (chain) {
        problem({ field: { rows: [draft.inputs.findIndex((row) => row.item === chain[0])] }, kind: "cycle", chain });
      }
    }
  }

  if (problems.length > 0) {
    return refuse(problems);
  }

  // Plans that reach the product through its one recipe keep using it once this second
  // variant exists, as though they had chosen it (worked out before anything is relabelled).
  const implicitUsers =
    siblings.length === 1
      ? new Set(
          data.plans.filter(
            (p) => p.completed === undefined && !p.variantChoices.has(draft.product) && planReaches(data.recipes, p, draft.product),
          ),
        )
      : new Set<Plan>();

  // Keep everything that names a recipe by its label pointing at the same recipe.
  let plans = data.plans;
  let recipes = others;
  if (existingLabel) {
    const { recipe: relabelled, label } = existingLabel;
    recipes = recipes.map((r) => (r === relabelled ? { ...r, variant: label } : r));
    plans = plans.map((p) => retarget(p, ref(relabelled), label));
  }
  if (original && original.product === recipe.product && original.variant !== recipe.variant) {
    plans = plans.map((p) => retarget(p, original, recipe.variant));
  }
  if (implicitUsers.size > 0) {
    const label = existingLabel?.label ?? siblings[0]!.variant!;
    plans = plans.map((p, i) =>
      implicitUsers.has(data.plans[i]!) ? { ...p, variantChoices: new Map(p.variantChoices).set(draft.product, label) } : p,
    );
  }
  // Plans whose work the change alters and that had reserved their materials are released.
  return releaseChanged(data, { ...data, recipes: [...recipes, recipe], plans });
}

/**
 * Combines duplicate input rows into the first of them, with the quantities added up. Other
 * rows keep their order.
 */
export function combineDuplicateInputs<Row extends { item: string; quantity: number }>(rows: readonly Row[]): Row[] {
  const first = new Map<string, number>();
  const result: Row[] = [];
  for (const row of rows) {
    const at = first.get(row.item);
    if (at === undefined) {
      first.set(row.item, result.length);
      result.push(row);
    } else {
      result[at] = { ...result[at]!, quantity: result[at]!.quantity + row.quantity };
    }
  }
  return result;
}

/** A plan with its references to one recipe's label moved to another label. */
function retarget(plan: Plan, from: RecipeRef, to: string | undefined): Plan {
  const target = sameRecipe(plan.target, from) ? { ...plan.target, variant: to } : plan.target;
  let variantChoices = plan.variantChoices;
  if (from.variant !== undefined && variantChoices.get(from.product) === from.variant) {
    variantChoices = new Map(variantChoices);
    if (to === undefined) {
      variantChoices.delete(from.product);
    } else {
      variantChoices.set(from.product, to);
    }
  }
  return target === plan.target && variantChoices === plan.variantChoices ? plan : { ...plan, target, variantChoices };
}

/** The cycle through `product` as the chain from the item `product` is made from, back round to that item. */
function startingAfter(cycle: string[], product: string): string[] | undefined {
  const loop = cycle.slice(0, -1);
  const at = loop.indexOf(product);
  if (at < 0) {
    return undefined;
  }
  const rotated = [...loop.slice(at + 1), ...loop.slice(0, at + 1)];
  return [...rotated, rotated[0]!];
}

function allItems(data: AppData): string[] {
  return [...[...data.items.categories.values()].flat(), ...data.items.uncategorised];
}

function sameRecipe(a: RecipeRef, b: RecipeRef): boolean {
  return a.product === b.product && a.variant === b.variant;
}

function ref(r: RecipeRef): RecipeRef {
  return { product: r.product, variant: r.variant };
}

function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === "" ? undefined : trimmed;
}

function isPositiveWhole(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 1;
}
