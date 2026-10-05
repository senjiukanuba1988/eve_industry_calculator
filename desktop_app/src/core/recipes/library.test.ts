import { emptyData } from "../data/format";
import { fixtureTexts } from "../data/fixtures/fixture";
import { loadData } from "../data/load";
import type { AppData, Plan } from "../data/model";
import { isRefusal } from "../refusal";
import { deleteRecipe, deleteRecipeEffect, filterRecipes } from "./library";

function fixture(): AppData {
  const loaded = loadData(fixtureTexts());
  if (!loaded.ok) {
    throw new Error("fixture does not load");
  }
  return loaded.data;
}

const names = (data: AppData, filter: Parameters<typeof filterRecipes>[1]) =>
  filterRecipes(data, filter).map((r) => (r.variant ? `${r.product} (${r.variant})` : r.product));

describe("browsing the library", () => {
  it("lists every recipe, sorted by product and variant, without a filter", () => {
    const data = fixture();
    expect(filterRecipes(data, {})).toHaveLength(data.recipes.length);
    expect(names(data, {})).toEqual([...names(data, {})].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  });

  it("filters by the product's category", () => {
    expect(names(fixture(), { category: "Ships" })).toEqual(["Flycatcher"]);
  });

  it("filters to products in no category", () => {
    const data = fixture();
    const uncategorised = new Set(data.items.uncategorised);
    const found = filterRecipes(data, { category: null });
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((r) => uncategorised.has(r.product))).toBe(true);
  });

  it("filters by type", () => {
    const data = fixture();
    const reactions = filterRecipes(data, { type: "Reaction" });
    expect(reactions.length).toBeGreaterThan(0);
    expect(reactions.every((r) => r.type === "Reaction")).toBe(true);
  });

  it("searches part of the product name, ignoring case, regardless of type or category", () => {
    expect(names(fixture(), { search: " acol" })).toEqual(names(fixture(), {}).filter((n) => n.startsWith("Acolyte")));
    expect(names(fixture(), { search: "acol" }).length).toBeGreaterThan(1);
  });

  it("combines criteria", () => {
    expect(names(fixture(), { search: "acol", type: "Reaction" })).toEqual([]);
  });
});

describe("deleting a recipe", () => {
  const plan = (name: string, product: string, completed?: string): Plan => ({
    name,
    target: { product },
    runs: 1,
    created: "2026-10-04T16:32:05+02:00",
    completed,
    variantChoices: new Map(),
    steps: [],
  });

  function library(plans: Plan[] = []): AppData {
    return {
      ...emptyData("1.0.0"),
      items: { categories: new Map(), uncategorised: ["A", "B", "Acolyte II"] },
      recipes: [
        { product: "A", type: "T1 Manufacturing", output: 1, inputs: new Map([["B", 1]]) },
        { product: "Acolyte II", variant: "X", type: "T2 Manufacturing", output: 1, inputs: new Map([["B", 1]]) },
        { product: "Acolyte II", variant: "Y", type: "T2 Manufacturing", output: 1, inputs: new Map([["B", 2]]) },
      ],
      plans,
    };
  }

  it("removes a recipe no plan builds", () => {
    const after = deleteRecipe(library([plan("Done", "A", "2026-10-05T10:00:00+02:00")]), { product: "A" });
    expect(isRefusal(after) ? after : after.recipes.map((r) => r.product)).toEqual(["Acolyte II", "Acolyte II"]);
  });

  it("refuses while an incomplete plan builds it, naming the plans", () => {
    expect(deleteRecipe(library([plan("Some As", "A")]), { product: "A" })).toEqual({
      refused: { kind: "targetedByPlans", plans: ["Some As"] },
    });
  });

  it("reports a recipe that no longer exists", () => {
    expect(deleteRecipe(library(), { product: "B" })).toEqual({ refused: { kind: "notFound", recipe: { product: "B" } } });
  });

  it("states whether the product becomes a base material or other variants remain", () => {
    expect(deleteRecipeEffect(library(), { product: "A" })).toEqual({ remaining: [] });
    expect(deleteRecipeEffect(library(), { product: "Acolyte II", variant: "X" })).toEqual({
      remaining: [{ product: "Acolyte II", variant: "Y" }],
    });
  });
});
