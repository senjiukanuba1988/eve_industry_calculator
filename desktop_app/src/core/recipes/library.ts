// Browsing and deleting recipes (recipe-library spec, "Browsing the library" and
// "Changing a recipe that plans depend on").

import { listItems } from "../catalog/items";
import type { AppData, Recipe, RecipeRef, RecipeType } from "../data/model";
import { compareRecipes } from "../data/serialize";
import { refuse, type Refusal } from "../refusal";

export interface RecipeFilter {
  type?: RecipeType;
  /** A category name, or `null` for products in no category. Absent: any. */
  category?: string | null;
  /** Part of the product name, ignoring case. */
  search?: string;
}

/** The recipes matching every given criterion, sorted by product and variant. */
export function filterRecipes(data: AppData, filter: RecipeFilter): Recipe[] {
  const categoryOf = new Map(listItems(data.items).map((i) => [i.name, i.category ?? null]));
  const needle = filter.search?.trim().toLowerCase() ?? "";
  return data.recipes
    .filter((r) => filter.type === undefined || r.type === filter.type)
    .filter((r) => filter.category === undefined || categoryOf.get(r.product) === filter.category)
    .filter((r) => r.product.toLowerCase().includes(needle))
    .sort(compareRecipes);
}

export type DeleteRecipeRefusal =
  | { kind: "notFound"; recipe: RecipeRef }
  /** Incomplete plans build this recipe; they must be completed or deleted first. */
  | { kind: "targetedByPlans"; plans: string[] };

/** What deleting a recipe means for its product, for the confirmation. */
export interface DeleteRecipeEffect {
  /** The product's other recipes, which remain. Empty: the product becomes a base material. */
  remaining: RecipeRef[];
}

export function deleteRecipeEffect(data: AppData, recipe: RecipeRef): DeleteRecipeEffect {
  return {
    remaining: data.recipes
      .filter((r) => r.product === recipe.product && r.variant !== recipe.variant)
      .map((r) => ({ product: r.product, variant: r.variant })),
  };
}

/** Deletes a recipe, unless an incomplete plan builds it. */
export function deleteRecipe(data: AppData, recipe: RecipeRef): AppData | Refusal<DeleteRecipeRefusal> {
  const same = (r: RecipeRef) => r.product === recipe.product && r.variant === recipe.variant;
  if (!data.recipes.some(same)) {
    return refuse({ kind: "notFound", recipe });
  }
  const plans = data.plans.filter((p) => p.completed === undefined && same(p.target)).map((p) => p.name);
  if (plans.length > 0) {
    return refuse({ kind: "targetedByPlans", plans });
  }
  return { ...data, recipes: data.recipes.filter((r) => !same(r)) };
}
