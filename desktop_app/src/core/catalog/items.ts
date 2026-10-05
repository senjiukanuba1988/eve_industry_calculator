// Renaming, re-categorising and deleting items (item-catalog spec, "Items").
// Items are referred to by name everywhere, so a rename rewrites every place that names
// the item - recipes, hangar stock and plans - in one change.

import type { AppData, ItemCatalog, Plan, PlanStep, Quantities, Recipe, RecipeRef } from "../data/model";
import { compareNames, nameKey } from "../data/names";
import { refuse, type Refusal } from "../refusal";
import { findCategory } from "./categories";

export type ItemRefusal =
  | { kind: "empty" }
  /** Another item already has this name, ignoring case and surrounding spaces. */
  | { kind: "duplicate"; existing: string }
  | { kind: "notFound"; item: string }
  | { kind: "categoryNotFound"; category: string }
  /** The item is the product or an input of these recipes. */
  | { kind: "usedByRecipes"; item: string; recipes: RecipeRef[] }
  /** The item still holds stock: in general stock, in plans' reserved piles, or both. */
  | { kind: "holdsStock"; item: string; quantity: number };

export interface ItemEntry {
  name: string;
  /** Absent for an item in no category. */
  category?: string;
}

/** Every item with its category. */
export function listItems(items: ItemCatalog): ItemEntry[] {
  return [
    ...[...items.categories].flatMap(([category, members]) => members.map((name) => ({ name, category }))),
    ...items.uncategorised.map((name) => ({ name })),
  ];
}

/** The item with this name ignoring case and surrounding spaces, as it is spelt in the data. */
export function findItem(items: ItemCatalog, name: string): string | undefined {
  const key = nameKey(name);
  return listItems(items).find((i) => nameKey(i.name) === key)?.name;
}

/** Recipes that produce or consume the item. */
export function recipesUsing(recipes: readonly Recipe[], item: string): RecipeRef[] {
  return recipes.filter((r) => r.product === item || r.inputs.has(item)).map((r) => ({ product: r.product, variant: r.variant }));
}

/** How much of the item is held: general stock plus every plan's reserved pile. */
export function heldQuantity(data: AppData, item: string): number {
  return data.plans.reduce((n, p) => n + (p.reserved?.get(item) ?? 0), data.hangar.stock.get(item) ?? 0);
}

/** Creates an item, in a category or in none. Its name is the trimmed `name`. */
export function createItem(data: AppData, name: string, category?: string): AppData | Refusal<ItemRefusal> {
  const trimmed = name.trim();
  if (trimmed === "") {
    return refuse({ kind: "empty" });
  }
  const existing = findItem(data.items, trimmed);
  if (existing !== undefined) {
    return refuse({ kind: "duplicate", existing });
  }
  if (category !== undefined && findCategory(data.items, category) !== category) {
    return refuse({ kind: "categoryNotFound", category });
  }
  const items: ItemCatalog =
    category === undefined
      ? { ...data.items, uncategorised: [...data.items.uncategorised, trimmed] }
      : { ...data.items, categories: new Map(data.items.categories).set(category, [...data.items.categories.get(category)!, trimmed]) };
  return { ...data, items };
}

export function renameItem(data: AppData, item: string, newName: string): AppData | Refusal<ItemRefusal> {
  if (findItem(data.items, item) !== item) {
    return refuse({ kind: "notFound", item });
  }
  const to = newName.trim();
  if (to === "") {
    return refuse({ kind: "empty" });
  }
  const existing = findItem(data.items, to);
  if (existing !== undefined && existing !== item) {
    return refuse({ kind: "duplicate", existing });
  }
  if (to === item) {
    return data;
  }

  const name = (n: string) => (n === item ? to : n);
  const quantities = (q: Quantities) => renameKey(q, item, to, (a, b) => a + b);

  const items: ItemCatalog = {
    categories: new Map([...data.items.categories].map(([c, members]) => [c, members.map(name)])),
    uncategorised: data.items.uncategorised.map(name),
  };
  const recipes = data.recipes.map((r): Recipe => ({ ...r, product: name(r.product), inputs: quantities(r.inputs) }));
  const step = (s: PlanStep): PlanStep => ({
    ...s,
    product: name(s.product),
    inputsPerRun: quantities(s.inputsPerRun),
    deducted: s.deducted && quantities(s.deducted),
    short: s.short && quantities(s.short),
  });
  const plans = data.plans.map((p): Plan => ({
    ...p,
    target: { ...p.target, product: name(p.target.product) },
    // A stale choice may already sit under the new name; the item's own choice wins.
    variantChoices: renameKey(p.variantChoices, item, to, (mine) => mine),
    reserved: p.reserved && quantities(p.reserved),
    steps: p.steps.map(step),
  }));
  return { ...data, items, recipes, hangar: { stock: quantities(data.hangar.stock) }, plans };
}

/** Moves an item into a category, or into no category when `category` is undefined. */
export function setItemCategory(data: AppData, item: string, category: string | undefined): AppData | Refusal<ItemRefusal> {
  if (findItem(data.items, item) !== item) {
    return refuse({ kind: "notFound", item });
  }
  if (category !== undefined && findCategory(data.items, category) !== category) {
    return refuse({ kind: "categoryNotFound", category });
  }
  const without = removeFromCatalog(data.items, item);
  const items: ItemCatalog =
    category === undefined
      ? { ...without, uncategorised: [...without.uncategorised, item] }
      : { ...without, categories: new Map(without.categories).set(category, [...without.categories.get(category)!, item]) };
  return { ...data, items };
}

/**
 * Deletes an item that nothing depends on. Refused while a recipe produces or consumes it,
 * or while it holds stock. Plans' history (stored steps, variant choices) does not count.
 */
export function deleteItem(data: AppData, item: string): AppData | Refusal<ItemRefusal> {
  if (findItem(data.items, item) !== item) {
    return refuse({ kind: "notFound", item });
  }
  const recipes = recipesUsing(data.recipes, item);
  if (recipes.length > 0) {
    return refuse({ kind: "usedByRecipes", item, recipes });
  }
  const quantity = heldQuantity(data, item);
  if (quantity > 0) {
    return refuse({ kind: "holdsStock", item, quantity });
  }
  return { ...data, items: removeFromCatalog(data.items, item) };
}

function removeFromCatalog(items: ItemCatalog, item: string): ItemCatalog {
  return {
    categories: new Map([...items.categories].map(([c, members]) => [c, members.filter((m) => m !== item)])),
    uncategorised: items.uncategorised.filter((m) => m !== item),
  };
}

/** The map with key `from` renamed to `to`; if `to` is already there, the two values are merged. */
function renameKey<V>(map: Map<string, V>, from: string, to: string, merge: (mine: V, theirs: V) => V): Map<string, V> {
  const value = map.get(from);
  if (value === undefined) {
    return map;
  }
  const result = new Map(map);
  result.delete(from);
  const theirs = result.get(to);
  result.set(to, theirs === undefined ? value : merge(value, theirs));
  return result;
}

/**
 * Items whose names contain `text`, ignoring case, best first: an exact match, then names
 * starting with the text, then the rest; alphabetical within each group.
 */
export function suggestItems(items: ItemCatalog, text: string, limit = 12): ItemEntry[] {
  const needle = text.trim().toLowerCase();
  if (needle === "") {
    return [];
  }
  const rank = (name: string) => {
    const lower = name.toLowerCase();
    return lower === needle ? 0 : lower.startsWith(needle) ? 1 : 2;
  };
  return listItems(items)
    .filter((i) => i.name.toLowerCase().includes(needle))
    .sort((a, b) => rank(a.name) - rank(b.name) || compareNames(a.name, b.name))
    .slice(0, limit);
}
