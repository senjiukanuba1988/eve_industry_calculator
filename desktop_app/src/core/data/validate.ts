// Checks that span files or whole collections, run once every file has decoded cleanly:
// unique names, references that resolve, the recipe rules, and plan targets. These are the
// rules the application would refuse to save, re-checked because a hand edit can break any.
//
// Deliberately not checked (design/data-files.md, "Validation on load"): variant choices
// and stored steps naming things that no longer exist, and stock of items no recipe uses.

import type { DataError } from "./dataError";
import { childPath, entryPath, type LineIndex } from "./decode";
import type { AppData, DataFileName, Recipe } from "./model";
import { nameKey } from "./names";

export type LineIndexes = Record<DataFileName, LineIndex>;

export function validateData(data: AppData, lines: LineIndexes): DataError[] {
  const errors: DataError[] = [];
  const report = (file: DataFileName, path: string, message: string) => {
    // Every path reported here is one the decoder visited, so its line is known.
    errors.push({ file, line: lines[file].get(path), path, message });
  };

  const items = checkItemNames(data, report);
  checkRecipes(data.recipes, items, report);
  checkHangar(data, items, report);
  checkPlans(data, items, report);
  return errors;
}

type Report = (file: DataFileName, path: string, message: string) => void;

const quote = JSON.stringify;

/** Checks category and item names are unique ignoring case; returns the exact item names. */
function checkItemNames(data: AppData, report: Report): Set<string> {
  const categories = new Map<string, string>();
  for (const name of data.items.categories.keys()) {
    const earlier = categories.get(nameKey(name));
    if (earlier !== undefined) {
      report("items.json", entryPath("categories", name), `category ${quote(name)} is the same name as ${quote(earlier)}; category names must differ by more than case`);
    } else {
      categories.set(nameKey(name), name);
    }
  }

  const items = new Map<string, string>();
  const place = (path: string, name: string) => {
    const earlier = items.get(nameKey(name));
    if (earlier !== undefined) {
      const same = earlier === name ? `${quote(name)} is listed more than once` : `${quote(name)} is the same name as ${quote(earlier)}`;
      report("items.json", path, `${same}; every item must appear exactly once, in one category or in uncategorised`);
    } else {
      items.set(nameKey(name), name);
    }
  };
  for (const [category, members] of data.items.categories) {
    members.forEach((name, i) => place(childPath(entryPath("categories", category), i), name));
  }
  data.items.uncategorised.forEach((name, i) => place(childPath("uncategorised", i), name));
  return new Set(items.values());
}

function checkRecipes(recipes: readonly Recipe[], items: ReadonlySet<string>, report: Report): void {
  const at = (i: number, field?: string) => (field ? childPath(childPath("recipes", i), field) : childPath("recipes", i));
  const input = (i: number, name: string) => entryPath(at(i, "inputs"), name);
  const notAnItem = (what: string, name: string) => `${what} ${quote(name)} is not an item in items.json`;

  recipes.forEach((r, i) => {
    if (!items.has(r.product)) {
      report("recipes.json", at(i, "product"), notAnItem("product", r.product));
    }
    if (r.inputs.size === 0) {
      report("recipes.json", at(i, "inputs"), `the recipe for ${quote(r.product)} has no inputs; a recipe needs at least one`);
    }
    for (const name of r.inputs.keys()) {
      if (!items.has(name)) {
        report("recipes.json", input(i, name), notAnItem("input", name));
      } else if (name === r.product) {
        report("recipes.json", input(i, name), `the recipe for ${quote(r.product)} consumes its own product; a recipe cannot do that`);
      }
    }
  });

  // Several recipes for one product: same type, T2 only, distinct labels.
  const byProduct = new Map<string, number[]>();
  recipes.forEach((r, i) => byProduct.set(r.product, [...(byProduct.get(r.product) ?? []), i]));
  for (const [product, indexes] of byProduct) {
    if (indexes.length < 2) {
      continue;
    }
    const first = recipes[indexes[0]!]!;
    const labels = new Map<string, number>();
    const mixed = indexes.slice(1).filter((i) => recipes[i]!.type !== first.type);
    for (const i of mixed) {
      report("recipes.json", at(i, "type"), `${quote(product)} has recipes of different types (${first.type} and ${recipes[i]!.type}); all recipes for one product must be of the same type`);
    }
    if (mixed.length > 0) {
      // Which recipes may coexist depends on the type; settle that first.
      continue;
    }
    if (first.type !== "T2 Manufacturing") {
      report("recipes.json", at(indexes[1]!), `${quote(product)} has ${indexes.length} recipes of type ${first.type}; only T2 Manufacturing products may have more than one recipe`);
      continue;
    }
    for (const i of indexes) {
      const variant = recipes[i]!.variant;
      if (variant === undefined) {
        report("recipes.json", at(i), `${quote(product)} has ${indexes.length} recipes, and this one has no variant label; each needs its own`);
        continue;
      }
      const earlier = labels.get(nameKey(variant));
      if (earlier !== undefined) {
        report("recipes.json", at(i, "variant"), `${quote(product)} has two recipes labelled ${quote(variant)}; each variant needs its own distinct label`);
      } else {
        labels.set(nameKey(variant), i);
      }
    }
  }

  for (const cycle of findCycles(recipes)) {
    const [from, to] = cycle.slice(-2) as [string, string];
    const closing = recipes.findIndex((r) => r.product === from && r.inputs.has(to));
    report("recipes.json", input(closing, to), `circular chain: ${cycle.join(" → ")}; no product may end up needed to make itself`);
  }
}

/**
 * Every distinct cycle among products, each as a chain from a product back to itself
 * (A → B → C → A), following "is made from" through all recipes, variants included.
 * Self-consumption is reported on its own and left out here.
 */
export function findCycles(recipes: readonly Recipe[]): string[][] {
  const madeFrom = new Map<string, Set<string>>();
  for (const r of recipes) {
    const inputs = madeFrom.get(r.product) ?? new Set<string>();
    for (const input of r.inputs.keys()) {
      if (input !== r.product) {
        inputs.add(input);
      }
    }
    madeFrom.set(r.product, inputs);
  }

  const cycles: string[][] = [];
  const seen = new Set<string>();
  const state = new Map<string, "active" | "finished">();
  const stack: string[] = [];

  const visit = (product: string) => {
    state.set(product, "active");
    stack.push(product);
    for (const input of madeFrom.get(product) ?? []) {
      const s = state.get(input);
      if (s === "active") {
        const cycle = [...stack.slice(stack.indexOf(input)), input];
        const key = [...new Set(cycle)].sort().join("\n");
        if (!seen.has(key)) {
          seen.add(key);
          cycles.push(cycle);
        }
      } else if (s === undefined) {
        visit(input);
      }
    }
    stack.pop();
    state.set(product, "finished");
  };
  for (const product of madeFrom.keys()) {
    if (!state.has(product)) {
      visit(product);
    }
  }
  return cycles;
}

function checkHangar(data: AppData, items: ReadonlySet<string>, report: Report): void {
  for (const name of data.hangar.stock.keys()) {
    if (!items.has(name)) {
      report("hangar.json", entryPath("stock", name), `${quote(name)} is not an item in items.json`);
    }
  }
}

function checkPlans(data: AppData, items: ReadonlySet<string>, report: Report): void {
  data.plans.forEach((plan, i) => {
    const at = (field: string) => childPath(childPath("plans", i), field);
    for (const name of plan.reserved?.keys() ?? []) {
      if (!items.has(name)) {
        report("plans.json", entryPath(at("reserved"), name), `reserved item ${quote(name)} is not an item in items.json`);
      }
    }
    // A completed plan may have lost its target: its recipe, and then the item, can be
    // deleted once no incomplete plan targets it. Only incomplete plans are checked.
    if (plan.completed !== undefined) {
      return;
    }
    const { product, variant } = plan.target;
    if (!items.has(product)) {
      report("plans.json", childPath(at("target"), "product"), `target ${quote(product)} is not an item in items.json`);
      return;
    }
    const recipes = data.recipes.filter((r) => r.product === product);
    if (recipes.some((r) => r.variant === variant)) {
      return;
    }
    const target = variant === undefined ? quote(product) : `${quote(product)} with variant ${quote(variant)}`;
    const labels = recipes.map((r) => (r.variant === undefined ? "no label" : quote(r.variant))).join(", ");
    report(
      "plans.json",
      at("target"),
      recipes.length === 0
        ? `plan ${quote(plan.name)} targets ${target}, which has no recipe in recipes.json`
        : `plan ${quote(plan.name)} targets ${target}, but recipes.json has ${quote(product)} only with: ${labels}`,
    );
  });
}
