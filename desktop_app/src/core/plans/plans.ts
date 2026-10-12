// Creating, renaming and deleting plans, and what a plan calculates to (production-plans
// spec, "Plans are saved and several may run at once", "Deleting a plan" and "Plans
// recalculate continuously"; material-calculation spec, "Choosing a variant").

import { calculate, type CalculationResult } from "../calculation/calculate";
import type { AppData, Plan, Quantities, Recipe, RecipeRef, Timestamp } from "../data/model";
import { compareNames } from "../data/names";
import { refuse, type Refusal } from "../refusal";

/**
 * A plan, as the screen knows it: its place in the list, and its name as a guard. Plan names
 * need not be unique, and an action runs later than it was asked for, so a plan whose name
 * at that place has changed is treated as gone rather than acting on the wrong one.
 */
export interface PlanAt {
  index: number;
  name: string;
}

/** The plan at that place, if it still has that name. */
export function planAt(data: AppData, at: PlanAt): Plan | undefined {
  const plan = data.plans[at.index];
  return plan && plan.name === at.name ? plan : undefined;
}

/** "80 Flycatcher", "50,000 Tungsten Carbide": what the plan leaves in the hangar once complete. */
export function suggestPlanName(recipe: Recipe, runs: number): string {
  return `${(recipe.output * runs).toLocaleString("en")} ${recipe.product}`;
}

export interface NewPlan {
  target: RecipeRef;
  runs: number;
  name: string;
}

export type PlanRefusal =
  | { kind: "planNotFound"; plan: string }
  | { kind: "recipeNotFound"; recipe: RecipeRef }
  | { kind: "runsNotWhole" }
  | { kind: "nameEmpty" }
  | { kind: "variantNotFound"; product: string; variant: string };

function findRecipe(data: AppData, ref: RecipeRef): Recipe | undefined {
  return data.recipes.find((r) => r.product === ref.product && r.variant === ref.variant);
}

/** Adds a plan at the end of the list. Its target and runs are fixed from now on. */
export function createPlan(data: AppData, plan: NewPlan, now: Timestamp): AppData | Refusal<PlanRefusal> {
  const recipe = findRecipe(data, plan.target);
  if (!recipe) {
    return refuse({ kind: "recipeNotFound", recipe: plan.target });
  }
  if (!Number.isSafeInteger(plan.runs) || plan.runs < 1) {
    return refuse({ kind: "runsNotWhole" });
  }
  const name = plan.name.trim();
  if (name === "") {
    return refuse({ kind: "nameEmpty" });
  }
  const created: Plan = {
    name,
    target: { product: recipe.product, variant: recipe.variant },
    runs: plan.runs,
    created: now,
    variantChoices: new Map(),
    steps: [],
  };
  return { ...data, plans: [...data.plans, created] };
}

/** Renames a plan. Nothing else changes; names need not be unique. */
export function renamePlan(data: AppData, at: PlanAt, newName: string): AppData | Refusal<PlanRefusal> {
  const plan = planAt(data, at);
  if (!plan) {
    return refuse({ kind: "planNotFound", plan: at.name });
  }
  const name = newName.trim();
  if (name === "") {
    return refuse({ kind: "nameEmpty" });
  }
  return replacePlan(data, at.index, { ...plan, name });
}

/**
 * Deletes a plan. Its reserved pile returns to general stock; what started steps consumed
 * stays spent and what done steps produced stays where it went.
 */
export function deletePlan(data: AppData, at: PlanAt): AppData | Refusal<PlanRefusal> {
  const plan = planAt(data, at);
  if (!plan) {
    return refuse({ kind: "planNotFound", plan: at.name });
  }
  return {
    ...data,
    hangar: { stock: plan.reserved ? addTo(data.hangar.stock, plan.reserved) : data.hangar.stock },
    plans: data.plans.filter((_, i) => i !== at.index),
  };
}

/**
 * Sets the recipe a plan uses for an intermediate. A reserved plan's needs change with it,
 * so its reservation is released (production-plans spec, "A reserved plan draws only on
 * its own pile"); the screen confirms that first.
 */
export function setVariantChoice(data: AppData, at: PlanAt, product: string, variant: string): AppData | Refusal<PlanRefusal> {
  const plan = planAt(data, at);
  if (!plan) {
    return refuse({ kind: "planNotFound", plan: at.name });
  }
  if (!findRecipe(data, { product, variant })) {
    return refuse({ kind: "variantNotFound", product, variant });
  }
  if (plan.variantChoices.get(product) === variant) {
    return data;
  }
  const variantChoices = new Map(plan.variantChoices).set(product, variant);
  return {
    ...data,
    hangar: { stock: plan.reserved ? addTo(data.hangar.stock, plan.reserved) : data.hangar.stock },
    plans: data.plans.map((p, i) => (i === at.index ? { ...plan, variantChoices, reserved: undefined } : p)),
  };
}

/** The plan as it stands now: a reserved plan counts only its own pile, any other plan general stock. */
export function calculatePlan(data: AppData, plan: Plan): CalculationResult {
  return calculate({
    recipes: data.recipes,
    target: plan.target,
    runs: plan.runs,
    available: plan.reserved ?? data.hangar.stock,
    variantChoices: plan.variantChoices,
    steps: plan.steps,
  });
}

/** An intermediate the plan could make in more than one way, and the way it uses. */
export interface VariantOption {
  product: string;
  variants: string[];
  /** The remembered choice, which may no longer name a recipe. */
  chosen?: string;
  chosenIsValid: boolean;
}

/**
 * Every choice a plan has: intermediates it reaches that have several recipes, and any
 * choice it remembers, so that a choice stays visible and changeable even while stock
 * makes it irrelevant. The target's variant is fixed at creation and is not among them.
 */
export function variantOptions(data: AppData, plan: Plan, result: CalculationResult): VariantOption[] {
  const variantsOf = new Map<string, string[]>();
  for (const r of data.recipes) {
    if (r.variant !== undefined) {
      variantsOf.set(r.product, [...(variantsOf.get(r.product) ?? []), r.variant]);
    }
  }
  const products = new Set(plan.variantChoices.keys());
  if (result.ok) {
    for (const item of result.trace.keys()) {
      if ((variantsOf.get(item)?.length ?? 0) > 1 && item !== plan.target.product) {
        products.add(item);
      }
    }
  }
  return [...products].sort(compareNames).map((product) => {
    const variants = [...(variantsOf.get(product) ?? [])].sort(compareNames);
    const chosen = plan.variantChoices.get(product);
    return { product, variants, chosen, chosenIsValid: chosen !== undefined && variants.includes(chosen) };
  });
}

function replacePlan(data: AppData, index: number, plan: Plan): AppData {
  return { ...data, plans: data.plans.map((p, i) => (i === index ? plan : p)) };
}

/** `stock` with `add` added to it, as a new map. */
export function addTo(stock: Quantities, add: Quantities): Quantities {
  const result = new Map(stock);
  for (const [item, quantity] of add) {
    result.set(item, (result.get(item) ?? 0) + quantity);
  }
  return result;
}

/** Completed plans are kept this many days (production-plans spec, "Completed plans are removed after a week"). */
export const KEEP_COMPLETED_DAYS = 7;

/** The date ("2026-10-13") a plan completed at `completed` is removed on: seven days later, by its own calendar. */
export function removalDate(completed: Timestamp): string {
  const [year, month, day] = completed.slice(0, 10).split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + KEEP_COMPLETED_DAYS)).toISOString().slice(0, 10);
}
