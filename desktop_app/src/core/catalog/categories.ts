// Creating, renaming and deleting categories (item-catalog spec, "Categories").
// Categories only organise items; nothing here touches recipes, stock or plans.

import type { AppData, ItemCatalog } from "../data/model";
import { nameKey } from "../data/names";
import { refuse, type Refusal } from "../refusal";

export type CategoryRefusal =
  | { kind: "empty" }
  /** Another category already has this name, ignoring case and surrounding spaces. */
  | { kind: "duplicate"; existing: string }
  /** Items still belong to the category. */
  | { kind: "inUse"; category: string; count: number }
  | { kind: "notFound"; category: string };

/** The category with this name ignoring case and surrounding spaces, as it is spelt in the data. */
export function findCategory(items: ItemCatalog, name: string): string | undefined {
  const key = nameKey(name);
  return [...items.categories.keys()].find((c) => nameKey(c) === key);
}

export function createCategory(data: AppData, name: string): AppData | Refusal<CategoryRefusal> {
  const trimmed = name.trim();
  if (trimmed === "") {
    return refuse({ kind: "empty" });
  }
  const existing = findCategory(data.items, trimmed);
  if (existing !== undefined) {
    return refuse({ kind: "duplicate", existing });
  }
  return withCategories(data, new Map([...data.items.categories, [trimmed, []]]));
}

/** Renames a category, keeping its items. Changing only the case of the name is allowed. */
export function renameCategory(data: AppData, category: string, newName: string): AppData | Refusal<CategoryRefusal> {
  const members = data.items.categories.get(category);
  if (members === undefined) {
    return refuse({ kind: "notFound", category });
  }
  const trimmed = newName.trim();
  if (trimmed === "") {
    return refuse({ kind: "empty" });
  }
  const existing = findCategory(data.items, trimmed);
  if (existing !== undefined && existing !== category) {
    return refuse({ kind: "duplicate", existing });
  }
  if (trimmed === category) {
    return data;
  }
  const categories = new Map(data.items.categories);
  categories.delete(category);
  categories.set(trimmed, members);
  return withCategories(data, categories);
}

/** Deletes a category, but only an empty one: deleting must never silently uncategorise items. */
export function deleteCategory(data: AppData, category: string): AppData | Refusal<CategoryRefusal> {
  const members = data.items.categories.get(category);
  if (members === undefined) {
    return refuse({ kind: "notFound", category });
  }
  if (members.length > 0) {
    return refuse({ kind: "inUse", category, count: members.length });
  }
  const categories = new Map(data.items.categories);
  categories.delete(category);
  return withCategories(data, categories);
}

/** Moves every item of a category to no category, leaving the category empty, so it can then be deleted. */
export function moveItemsOutOfCategory(data: AppData, category: string): AppData | Refusal<CategoryRefusal> {
  const members = data.items.categories.get(category);
  if (members === undefined) {
    return refuse({ kind: "notFound", category });
  }
  const categories = new Map(data.items.categories);
  categories.set(category, []);
  return { ...data, items: { categories, uncategorised: [...data.items.uncategorised, ...members] } };
}

function withCategories(data: AppData, categories: Map<string, string[]>): AppData {
  return { ...data, items: { ...data.items, categories } };
}
