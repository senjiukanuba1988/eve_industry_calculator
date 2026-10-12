import { emptyData } from "../data/format";
import { loadData, type DataFileTexts } from "../data/load";
import { DATA_FILES, type AppData, type Plan, type Recipe, type RecipeRef } from "../data/model";
import { serializeFile } from "../data/serialize";
import { pasteStock } from "../hangar/paste";
import { hangarRows } from "../hangar/stock";
import { calculatePlan } from "../plans/plans";
import { reservePlan } from "../plans/reservations";
import { isRefusal, type Refusal } from "../refusal";
import { deleteRecipe } from "./library";
import { planReaches, plansChangedBy } from "./planImpact";
import { saveRecipe, type RecipeDraft, type SaveRecipeOptions } from "./saveRecipe";

// One X from 3 y and 2 z, one y from 2 a and 2 b; one Pack from 2 Drone.
const X: Recipe = { product: "X", type: "T1 Manufacturing", output: 1, inputs: new Map([["y", 3], ["z", 2]]) };
const Y: Recipe = { product: "y", type: "T1 Manufacturing", output: 1, inputs: new Map([["a", 2], ["b", 2]]) };
const REAGENT: Recipe = { product: "Reagent", type: "Reaction", output: 200, inputs: new Map([["a", 1]]) };
const PACK: Recipe = { product: "Pack", type: "T1 Manufacturing", output: 1, inputs: new Map([["Drone", 2]]) };
const drone = (variant?: string, input = "a"): Recipe => ({ product: "Drone", variant, type: "T2 Manufacturing", output: 1, inputs: new Map([[input, 1]]) });

function plan(name: string, target: RecipeRef, more: Partial<Plan> = {}): Plan {
  return { name, target, runs: 1, created: "2026-10-04T16:32:05+02:00", variantChoices: new Map(), steps: [], ...more };
}

function data(recipes: Recipe[], plans: Plan[], stock: Array<[string, number]> = [["a", 100], ["b", 100], ["z", 100]]): AppData {
  return {
    ...emptyData("1.0.0"),
    items: { categories: new Map(), uncategorised: ["a", "b", "c", "Drone", "Pack", "Reagent", "X", "y", "z"] },
    recipes,
    hangar: { stock: new Map(stock) },
    plans,
  };
}

function ok<T extends object>(outcome: T | Refusal<unknown>): T {
  if (isRefusal(outcome)) {
    throw new Error(`refused: ${JSON.stringify(outcome.refused)}`);
  }
  return outcome;
}

/** Saves, and checks the result is data the next start accepts. */
function save(before: AppData, draft: RecipeDraft, options?: SaveRecipeOptions): AppData {
  const after = ok(saveRecipe(before, draft, options));
  const reloaded = loadData(Object.fromEntries(DATA_FILES.map((f) => [f, serializeFile(f, after)])) as DataFileTexts);
  expect(reloaded.ok ? [] : reloaded.errors).toEqual([]);
  return after;
}

function draftOf(recipe: Recipe, change: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    product: recipe.product,
    type: recipe.type,
    variant: recipe.variant,
    output: recipe.output,
    notes: recipe.notes,
    inputs: [...recipe.inputs].map(([item, quantity]) => ({ item, quantity })),
    ...change,
  };
}

const reserved = (d: AppData, index = 0) => ok(reservePlan(d, { index, name: d.plans[index]!.name }));

describe("editing a recipe an open plan uses", () => {
  it("names the plans whose work changes", () => {
    const before = data([X, Y, REAGENT], [plan("1 X", { product: "X" }), plan("Reagent", { product: "Reagent" })]);
    const after = save(before, draftOf(Y, { inputs: [{ item: "a", quantity: 2 }, { item: "b", quantity: 2 }, { item: "c", quantity: 1 }] }), { original: { product: "y" } });

    expect(plansChangedBy(before, after)).toEqual([{ at: { index: 0, name: "1 X" }, reserved: false }]);
    // The plan reflects the change: it now also needs c.
    const result = calculatePlan(after, after.plans[0]!);
    expect(result.ok && result.acquire).toEqual([{ item: "c", quantity: 3 }]);
  });

  it("affects no plan when only the notes or the label change", () => {
    const before = data([X, Y], [plan("1 X", { product: "X" })]);
    const notes = save(before, draftOf(Y, { notes: "cheap" }), { original: { product: "y" } });
    const label = save(before, draftOf(Y, { variant: "Standard" }), { original: { product: "y" } });

    expect(plansChangedBy(before, notes)).toEqual([]);
    expect(plansChangedBy(before, label)).toEqual([]);
  });

  it("affects no plan when the hangar covers the intermediate it is for", () => {
    const before = data([X, Y], [plan("1 X", { product: "X" })], [["y", 3], ["z", 2]]);
    const after = save(before, draftOf(Y, { inputs: [{ item: "c", quantity: 9 }] }), { original: { product: "y" } });

    expect(plansChangedBy(before, after)).toEqual([]);
  });

  it("ignores completed plans", () => {
    const before = data([X, Y], [plan("1 X", { product: "X" }, { completed: "2026-10-05T10:00:00+02:00" })]);
    const after = save(before, draftOf(Y, { output: 2 }), { original: { product: "y" } });

    expect(plansChangedBy(before, after)).toEqual([]);
  });
});

describe("editing a recipe a reserved plan uses", () => {
  it("releases the reservation: the pile returns to general stock and the plan continues unreserved", () => {
    const before = reserved(data([X, Y], [plan("1 X", { product: "X" })]));
    expect(before.plans[0]!.reserved).toEqual(new Map([["z", 2], ["a", 6], ["b", 6]]));

    const after = save(before, draftOf(Y, { output: 3 }), { original: { product: "y" } });

    expect(plansChangedBy(before, after)).toEqual([{ at: { index: 0, name: "1 X" }, reserved: true }]);
    expect(after.plans[0]!.reserved).toBeUndefined();
    expect(after.hangar.stock).toEqual(new Map([["a", 100], ["b", 100], ["z", 100]]));
  });

  it("keeps the reservation of a plan the change does not affect", () => {
    const before = reserved(data([X, Y, REAGENT], [plan("1 X", { product: "X" })]));
    const after = save(before, draftOf(REAGENT, { output: 100 }), { original: { product: "Reagent" } });

    expect(after.plans[0]!.reserved).toEqual(before.plans[0]!.reserved);
    expect(after.hangar.stock).toEqual(before.hangar.stock);
  });

  it("keeps the reservation when the pile holds the intermediate whose recipe changes", () => {
    const before = reserved(data([X, Y], [plan("1 X", { product: "X" })], [["y", 3], ["z", 2]]));
    const after = save(before, draftOf(Y, { inputs: [{ item: "c", quantity: 1 }] }), { original: { product: "y" } });

    expect(after.plans[0]!.reserved).toEqual(new Map([["y", 3], ["z", 2]]));
  });

  it("keeps the reservation when a new recipe is for a material the pile already covers", () => {
    const before = reserved(data([X, Y], [plan("1 X", { product: "X" })]));
    const after = save(before, { product: "z", type: "T1 Manufacturing", output: 1, inputs: [{ item: "c", quantity: 1 }] });

    expect(plansChangedBy(before, after)).toEqual([]);
    expect(after.plans[0]!.reserved).toEqual(before.plans[0]!.reserved);
  });
});

describe("deleting a recipe an open plan merely uses", () => {
  it("makes the item a base material those plans must acquire", () => {
    const before = data([X, Y], [plan("1 X", { product: "X" })]);
    const after = ok(deleteRecipe(before, { product: "y" }));

    expect(plansChangedBy(before, after)).toEqual([{ at: { index: 0, name: "1 X" }, reserved: false }]);
    const result = calculatePlan(after, after.plans[0]!);
    expect(result.ok && result.acquire).toEqual([{ item: "y", quantity: 3 }]);
  });

  it("releases the reservation of a reserved plan using it", () => {
    const before = reserved(data([X, Y], [plan("1 X", { product: "X" })]));
    const after = ok(deleteRecipe(before, { product: "y" }));

    expect(after.plans[0]!.reserved).toBeUndefined();
    expect(after.hangar.stock).toEqual(new Map([["a", 100], ["b", 100], ["z", 100]]));
  });

  it("leaves a plan alone whose started steps already make all it needs, though they move on the checklist", () => {
    // w is made before y on the checklist, both a tier above the base materials; once y has no recipe, its started step moves down a tier, ahead of w.
    const x: Recipe = { ...X, inputs: new Map([["y", 3], ["w", 1]]) };
    const w: Recipe = { product: "w", type: "T1 Manufacturing", output: 1, inputs: new Map([["a", 1]]) };
    const started = { state: "started" as const, product: "y", runs: 3, inputsPerRun: Y.inputs, outputPerRun: 1, takenFrom: "general" as const, started: "2026-10-05T10:00:00+02:00" };
    const before = data([x, w, Y], [plan("1 X", { product: "X" }, { steps: [started] })], [["c", 1]]);
    const after = ok(deleteRecipe(before, { product: "y" }));

    const order = (d: AppData) => {
      const result = calculatePlan(d, d.plans[0]!);
      return result.ok ? result.builds.map((b) => b.product) : [];
    };
    expect(order(before)).toEqual(["w", "y", "X"]);
    expect(order(after)).toEqual(["y", "w", "X"]);
    expect(plansChangedBy(before, after)).toEqual([]);
  });

  it("leaves a plan that does not use it alone", () => {
    const before = reserved(data([X, Y, REAGENT], [plan("1 X", { product: "X" })]));
    const after = ok(deleteRecipe(before, { product: "Reagent" }));

    expect(plansChangedBy(before, after)).toEqual([]);
    expect(after.plans[0]!.reserved).toEqual(before.plans[0]!.reserved);
  });
});

describe("a remembered choice becomes invalid", () => {
  it("keeps the choice, so the plan flags that a new one is needed", () => {
    const choices = new Map([["Drone", "Cheap"]]);
    const before = data([PACK, drone("Fast"), drone("Cheap", "b")], [plan("1 Pack", { product: "Pack" }, { variantChoices: choices })]);
    const after = ok(deleteRecipe(before, { product: "Drone", variant: "Cheap" }));

    expect(plansChangedBy(before, after)).toEqual([{ at: { index: 0, name: "1 Pack" }, reserved: false }]);
    expect(after.plans[0]!.variantChoices).toEqual(choices);
    const result = calculatePlan(after, after.plans[0]!);
    expect(result.ok && result.choicesNeeded).toEqual([{ product: "Drone", variants: ["Fast"], invalidChoice: "Cheap", stillNeeded: 2 }]);
  });
});

describe("a second variant is added later", () => {
  const cheap = (): RecipeDraft => ({ ...draftOf(drone("Cheap", "b")) });

  it("keeps plans on the recipe they were using, as though chosen, labelling the existing recipe in the same save", () => {
    const before = data([PACK, drone()], [plan("1 Pack", { product: "Pack" })]);
    const after = save(before, cheap(), { existingLabel: "Fast" });

    expect(after.plans[0]!.variantChoices).toEqual(new Map([["Drone", "Fast"]]));
    expect(plansChangedBy(before, after)).toEqual([]);
    const result = calculatePlan(after, after.plans[0]!);
    expect(result.ok && result.choicesNeeded).toEqual([]);
  });

  it("uses the existing recipe's own label when it already has one", () => {
    const before = data([PACK, drone("Fast")], [plan("1 Pack", { product: "Pack" })]);
    const after = save(before, cheap());

    expect(after.plans[0]!.variantChoices).toEqual(new Map([["Drone", "Fast"]]));
  });

  it("remembers the choice even while the hangar covers the intermediate", () => {
    const before = data([PACK, drone("Fast")], [plan("1 Pack", { product: "Pack" })], [["Drone", 10]]);
    const after = save(before, cheap());

    expect(after.plans[0]!.variantChoices).toEqual(new Map([["Drone", "Fast"]]));
  });

  it("keeps a reserved plan reserved", () => {
    const before = reserved(data([PACK, drone("Fast")], [plan("1 Pack", { product: "Pack" })]));
    const after = save(before, cheap());

    expect(after.plans[0]!.reserved).toEqual(before.plans[0]!.reserved);
  });

  it("leaves plans that do not reach it, plans targeting it and completed plans alone", () => {
    const before = data(
      [PACK, X, Y, drone("Fast")],
      [
        plan("1 X", { product: "X" }),
        plan("1 Drone", { product: "Drone", variant: "Fast" }),
        plan("old", { product: "Pack" }, { completed: "2026-10-05T10:00:00+02:00" }),
      ],
    );
    const after = save(before, cheap());

    expect(after.plans.map((p) => p.variantChoices)).toEqual([new Map(), new Map(), new Map()]);
  });
});

describe("whether a plan reaches an item", () => {
  it("follows sole recipes and remembered choices, and stops at an open choice", () => {
    const recipes = [PACK, drone("Fast"), drone("Cheap", "b")];
    expect(planReaches(recipes, plan("p", { product: "Pack" }), "Drone")).toBe(true);
    expect(planReaches(recipes, plan("p", { product: "Pack" }), "a")).toBe(false);
    expect(planReaches(recipes, plan("p", { product: "Pack" }, { variantChoices: new Map([["Drone", "Cheap"]]) }), "b")).toBe(true);
    expect(planReaches([X, Y], plan("p", { product: "X" }), "a")).toBe(true);
    expect(planReaches([X, Y], plan("p", { product: "X" }), "X")).toBe(false);
  });
});

describe("a recipe changes under a plan with done steps", () => {
  it("reflects the change in what is still to do, without reopening done steps", () => {
    const done = {
      state: "done" as const,
      product: "y",
      runs: 3,
      inputsPerRun: Y.inputs,
      outputPerRun: 1,
      takenFrom: "general" as const,
      started: "2026-10-05T10:00:00+02:00",
      done: "2026-10-05T12:00:00+02:00",
      addedToReserved: 0,
      addedToGeneral: 3,
    };
    const before = data([X, Y], [plan("2 X", { product: "X" }, { runs: 2, steps: [done] })], [["y", 3], ["z", 100]]);
    const after = save(before, draftOf(Y, { inputs: [{ item: "c", quantity: 1 }] }), { original: { product: "y" } });

    expect(after.plans[0]!.steps).toEqual([done]);
    const result = calculatePlan(after, after.plans[0]!);
    // 6 y needed, 3 in the hangar from the done step: 3 more, now made of c.
    expect(result.ok && result.acquire).toEqual([{ item: "c", quantity: 3 }]);
  });
});

describe("the hangar when recipes change", () => {
  it("an item that becomes relevant later: saving a recipe that uses it does not bring back what a paste ignored", () => {
    const before = data([X, Y], []);
    const pasted = pasteStock(before, "c\t40");
    expect(pasted.summary.ignored).toEqual([{ name: "c", quantity: 40, reason: "notUsedByRecipe" }]);

    const after = save(pasted.data, { product: "Reagent", type: "Reaction", output: 1, inputs: [{ item: "c", quantity: 1 }] });
    expect(after.hangar.stock).toEqual(before.hangar.stock);
  });

  it("an item's last recipe is deleted: its stock stays, marked as no longer used", () => {
    const before = data([X, Y, REAGENT], [], [["Reagent", 500]]);
    const after = ok(deleteRecipe(before, { product: "Reagent" }));

    expect(after.hangar.stock.get("Reagent")).toBe(500);
    expect(hangarRows(after).find((r) => r.item === "Reagent")).toMatchObject({ available: 500, usedByRecipes: false });
  });
});
