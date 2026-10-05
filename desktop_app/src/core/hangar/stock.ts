// Seeing and correcting stock (hangar spec, "Seeing and correcting stock"). General stock
// lives in the hangar; reserved stock lives on the plans holding it, and is only shown here.

import { listItems } from "../catalog/items";
import type { AppData } from "../data/model";
import { compareNames } from "../data/names";
import { refuse, type Refusal } from "../refusal";

export interface HangarRow {
  item: string;
  category?: string;
  available: number;
  reserved: number;
  total: number;
  /** The plans holding the reserved part (with their place in the plan list), and how much each holds. */
  reservedBy: Array<{ plan: string; index: number; quantity: number }>;
  /** False once no recipe uses the item, as input or product: it can be removed if wanted. */
  usedByRecipes: boolean;
}

/** Every item held, available or reserved, sorted by name. */
export function hangarRows(data: AppData): HangarRow[] {
  const categories = new Map(listItems(data.items).map((i) => [i.name, i.category]));
  const used = new Set(data.recipes.flatMap((r) => [r.product, ...r.inputs.keys()]));
  const rows = new Map<string, HangarRow>();
  const row = (item: string) => {
    let r = rows.get(item);
    if (!r) {
      r = { item, category: categories.get(item), available: 0, reserved: 0, total: 0, reservedBy: [], usedByRecipes: used.has(item) };
      rows.set(item, r);
    }
    return r;
  };
  for (const [item, quantity] of data.hangar.stock) {
    row(item).available += quantity;
  }
  data.plans.forEach((plan, index) => {
    for (const [item, quantity] of plan.reserved ?? []) {
      const r = row(item);
      r.reserved += quantity;
      r.reservedBy.push({ plan: plan.name, index, quantity });
    }
  });
  for (const r of rows.values()) {
    r.total = r.available + r.reserved;
    r.reservedBy.sort((a, b) => compareNames(a.plan, b.plan) || a.index - b.index);
  }
  return [...rows.values()].sort((a, b) => compareNames(a.item, b.item));
}

export type StockRefusal = { kind: "notWholeNumber" } | { kind: "notAnItem"; item: string };

/** Sets an item's available (general) quantity by hand; 0 removes it. Reserved stock is untouched. */
export function setAvailable(data: AppData, item: string, quantity: number): AppData | Refusal<StockRefusal> {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    return refuse({ kind: "notWholeNumber" });
  }
  if (!listItems(data.items).some((i) => i.name === item)) {
    return refuse({ kind: "notAnItem", item });
  }
  const stock = new Map(data.hangar.stock);
  if (quantity === 0) {
    stock.delete(item);
  } else {
    stock.set(item, quantity);
  }
  return { ...data, hangar: { stock } };
}

/** Removes an item's available stock entirely. What plans hold reserved stays with them. */
export function removeStock(data: AppData, item: string): AppData | Refusal<StockRefusal> {
  return setAvailable(data, item, 0);
}
