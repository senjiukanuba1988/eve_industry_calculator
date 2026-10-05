import { emptyData } from "../data/format";
import { loadData, type DataFileTexts } from "../data/load";
import { DATA_FILES, type AppData, type Plan, type Recipe, type RecipeType } from "../data/model";
import { serializeFile } from "../data/serialize";
import { isRefusal, type Refusal } from "../refusal";
import { combineDuplicateInputs, saveRecipe, type RecipeDraft, type RecipeProblem, type SaveRecipeOptions } from "./saveRecipe";

const ITEMS = ["A", "B", "C", "D", "Acolyte II", "Robotics", "Tungsten Carbide", "Rolled Tungsten Alloy", "Sulfuric Acid"];

function recipe(product: string, inputs: Record<string, number>, type: RecipeType = "T1 Manufacturing", variant?: string): Recipe {
  return { product, variant, type, output: 1, inputs: new Map(Object.entries(inputs)) };
}

function library(recipes: Recipe[] = [], plans: Plan[] = []): AppData {
  return { ...emptyData("1.0.0"), items: { categories: new Map(), uncategorised: ITEMS }, recipes, plans };
}

function draft(product: string, inputs: Array<[string, number]>, more: Partial<RecipeDraft> = {}): RecipeDraft {
  return { product, type: "T1 Manufacturing", output: 1, inputs: inputs.map(([item, quantity]) => ({ item, quantity })), ...more };
}

function plan(name: string, target: { product: string; variant?: string }, more: Partial<Plan> = {}): Plan {
  return { name, target, runs: 1, created: "2026-10-04T16:32:05+02:00", variantChoices: new Map(), steps: [], ...more };
}

function saved(outcome: AppData | Refusal<RecipeProblem[]>): AppData {
  if (isRefusal(outcome)) {
    throw new Error(`refused: ${JSON.stringify(outcome.refused)}`);
  }
  // Whatever a save produces must be data the next start accepts.
  const reloaded = loadData(Object.fromEntries(DATA_FILES.map((f) => [f, serializeFile(f, outcome)])) as DataFileTexts);
  expect(reloaded.ok ? [] : reloaded.errors).toEqual([]);
  return outcome;
}

function problems(data: AppData, d: RecipeDraft, options?: SaveRecipeOptions): RecipeProblem[] {
  const outcome = saveRecipe(data, d, options);
  if (!isRefusal(outcome)) {
    throw new Error("expected the save to be refused");
  }
  return outcome.refused;
}

const t2 = (product: string, variant: string | undefined, inputs: Record<string, number> = { Robotics: 1 }) =>
  recipe(product, inputs, "T2 Manufacturing", variant);

describe("what a recipe records", () => {
  it("saves a batch-output reaction as entered", () => {
    const after = saved(
      saveRecipe(
        library(),
        draft(
          "Tungsten Carbide",
          [
            ["Rolled Tungsten Alloy", 98],
            ["Sulfuric Acid", 98],
          ],
          { type: "Reaction", output: 10000, notes: "  bonused refinery  " },
        ),
      ),
    );
    expect(after.recipes).toEqual([
      {
        product: "Tungsten Carbide",
        variant: undefined,
        type: "Reaction",
        output: 10000,
        notes: "bonused refinery",
        inputs: new Map([
          ["Rolled Tungsten Alloy", 98],
          ["Sulfuric Acid", 98],
        ]),
      },
    ]);
  });

  it("rejects a recipe with no inputs", () => {
    expect(problems(library(), draft("A", []))).toEqual([{ field: "inputs", kind: "noInputs" }]);
  });

  it.each([0, -5, 1.5, Number.NaN])("rejects an output of %s, at the output field", (output) => {
    expect(problems(library(), draft("A", [["B", 1]], { output }))).toEqual([{ field: "output", kind: "notPositiveWhole" }]);
  });

  it.each([0, -1, 2.5])("rejects an input quantity of %s, at that row", (quantity) => {
    expect(
      problems(
        library(),
        draft("A", [
          ["B", 1],
          ["C", quantity],
        ]),
      ),
    ).toEqual([{ field: { rows: [1] }, kind: "notPositiveWhole" }]);
  });

  it("rejects names that are not items", () => {
    expect(problems(library(), draft("Nope", [["Nada", 1]]))).toEqual([
      { field: "product", kind: "unknownItem", item: "Nope" },
      { field: { rows: [0] }, kind: "unknownItem", item: "Nada" },
    ]);
  });

  it("treats an empty or blank variant label as none", () => {
    expect(saved(saveRecipe(library(), draft("A", [["B", 1]], { variant: "   " }))).recipes[0]!.variant).toBeUndefined();
  });

  it("allows a label on a product's only recipe", () => {
    expect(saved(saveRecipe(library(), draft("A", [["B", 1]], { variant: "ME 10" }))).recipes[0]!.variant).toBe("ME 10");
  });
});

describe("one recipe per product, except T2 Manufacturing", () => {
  it("rejects a second recipe for a planetary product, naming the existing one", () => {
    const data = library([recipe("Robotics", { A: 10 }, "Planetary Industry")]);
    expect(problems(data, draft("Robotics", [["B", 10]], { type: "Planetary Industry" }))).toEqual([
      { field: "product", kind: "onlyT2MayHaveSeveral", existing: { product: "Robotics", variant: undefined } },
    ]);
  });

  it("keeps a second T2 variant with a distinct label", () => {
    const data = library([t2("Acolyte II", "Accelerant Decryptor")]);
    const after = saved(saveRecipe(data, draft("Acolyte II", [["A", 1]], { type: "T2 Manufacturing", variant: "Symmetry Decryptor" })));
    expect(after.recipes.map((r) => r.variant)).toEqual(["Accelerant Decryptor", "Symmetry Decryptor"]);
  });

  it("rejects a second T2 variant without a label", () => {
    const data = library([t2("Acolyte II", "Accelerant Decryptor")]);
    expect(problems(data, draft("Acolyte II", [["A", 1]], { type: "T2 Manufacturing" }))).toEqual([
      { field: "variant", kind: "labelNeeded" },
    ]);
  });

  it("rejects a second T2 variant with the same label, ignoring case", () => {
    const data = library([t2("Acolyte II", "Accelerant Decryptor")]);
    expect(problems(data, draft("Acolyte II", [["A", 1]], { type: "T2 Manufacturing", variant: "accelerant decryptor " }))).toEqual([
      { field: "variant", kind: "labelNotDistinct", label: "Accelerant Decryptor" },
    ]);
  });

  it("rejects mixing recipe types for one product, naming the existing recipe", () => {
    const data = library([recipe("A", { B: 1 })]);
    expect(problems(data, draft("A", [["C", 1]], { type: "T2 Manufacturing", variant: "X" }))).toEqual([
      { field: "type", kind: "mixedTypes", existing: { product: "A", variant: undefined }, existingType: "T1 Manufacturing" },
    ]);
  });

  describe("adding a second variant when the first has no label", () => {
    const data = library([t2("Acolyte II", undefined)], [plan("30 Acolyte II", { product: "Acolyte II" })]);
    const second = draft("Acolyte II", [["A", 1]], { type: "T2 Manufacturing", variant: "Symmetry Decryptor" });

    it("asks for a label for the existing recipe", () => {
      expect(problems(data, second)).toEqual([
        { field: "existingLabel", kind: "existingNeedsLabel", existing: { product: "Acolyte II", variant: undefined } },
      ]);
    });

    it("saves both together once both labels are filled in and distinct, and plans follow the relabelled recipe", () => {
      const after = saved(saveRecipe(data, second, { existingLabel: " Accelerant Decryptor " }));
      expect(after.recipes.map((r) => r.variant)).toEqual(["Accelerant Decryptor", "Symmetry Decryptor"]);
      expect(after.plans[0]!.target).toEqual({ product: "Acolyte II", variant: "Accelerant Decryptor" });
    });

    it("rejects two labels that are the same", () => {
      expect(problems(data, second, { existingLabel: "symmetry decryptor" })).toEqual([
        { field: "existingLabel", kind: "labelNotDistinct", label: "symmetry decryptor" },
      ]);
    });

    it("asks for both labels when neither is given", () => {
      expect(problems(data, { ...second, variant: "" }).map((p) => p.field)).toEqual(["existingLabel", "variant"]);
    });
  });
});

describe("recipe validation", () => {
  it("rejects the same input twice, with both rows and the combined quantity", () => {
    expect(
      problems(
        library(),
        draft("A", [
          ["B", 2],
          ["C", 1],
          ["B", 3],
        ]),
      ),
    ).toEqual([{ field: { rows: [0, 2] }, kind: "duplicateInput", item: "B", total: 5 }]);
  });

  it("combines duplicate rows into the first, adding the quantities", () => {
    expect(
      combineDuplicateInputs([
        { item: "B", quantity: 2 },
        { item: "C", quantity: 1 },
        { item: "B", quantity: 3 },
      ]),
    ).toEqual([
      { item: "B", quantity: 5 },
      { item: "C", quantity: 1 },
    ]);
  });

  it("rejects a product consuming itself", () => {
    expect(
      problems(
        library(),
        draft("A", [
          ["B", 1],
          ["A", 1],
        ]),
      ),
    ).toEqual([{ field: { rows: [1] }, kind: "consumesItself" }]);
  });

  it("rejects a circular chain of three, showing A to B to C to A on the row that closes it", () => {
    const data = library([recipe("A", { B: 1 }), recipe("B", { C: 1 })]);
    expect(
      problems(
        data,
        draft("C", [
          ["D", 1],
          ["A", 1],
        ]),
      ),
    ).toEqual([{ field: { rows: [1] }, kind: "cycle", chain: ["A", "B", "C", "A"] }]);
  });

  it("rejects a circular chain of two", () => {
    const data = library([recipe("A", { B: 1 })]);
    expect(problems(data, draft("B", [["A", 1]]))).toEqual([{ field: { rows: [0] }, kind: "cycle", chain: ["A", "B", "A"] }]);
  });

  it("rejects a circular chain through a T2 variant", () => {
    // Only the second variant of Acolyte II uses B, but that is enough to close the circle.
    const data = library([t2("Acolyte II", "Accelerant Decryptor", { A: 1 }), t2("Acolyte II", "Symmetry Decryptor", { B: 1 })]);
    expect(problems(data, draft("B", [["Acolyte II", 1]]))).toEqual([
      { field: { rows: [0] }, kind: "cycle", chain: ["Acolyte II", "B", "Acolyte II"] },
    ]);
  });

  it("allows a diamond, which is not a circle", () => {
    const data = library([recipe("A", { B: 1, C: 1 }), recipe("B", { D: 1 })]);
    expect(saved(saveRecipe(data, draft("C", [["D", 1]]))).recipes).toHaveLength(3);
  });

  it("reports every problem at once", () => {
    expect(
      problems(
        library(),
        draft(
          "A",
          [
            ["A", 0],
            ["B", 1],
          ],
          { output: 0 },
        ),
      ).map((p) => p.kind),
    ).toEqual(["notPositiveWhole", "notPositiveWhole", "consumesItself"]);
  });
});

describe("editing a recipe", () => {
  it("replaces the original in place", () => {
    const data = library([recipe("A", { B: 1 }), recipe("C", { D: 1 })]);
    const after = saved(saveRecipe(data, draft("A", [["D", 4]], { output: 2 }), { original: { product: "A" } }));
    expect(after.recipes.find((r) => r.product === "A")).toMatchObject({ output: 2, inputs: new Map([["D", 4]]) });
    expect(after.recipes).toHaveLength(2);
  });

  it("does not count the original as a second recipe for its product", () => {
    const data = library([recipe("Robotics", { A: 10 }, "Planetary Industry")]);
    expect(
      saved(saveRecipe(data, draft("Robotics", [["B", 10]], { type: "Planetary Industry" }), { original: { product: "Robotics" } }))
        .recipes,
    ).toHaveLength(1);
  });

  it("moves plan targets and variant choices along when the label changes", () => {
    const data = library(
      [t2("Acolyte II", "Accelerant Decryptor"), t2("Acolyte II", "Symmetry Decryptor"), recipe("A", { "Acolyte II": 5 })],
      [
        plan("Drones", { product: "Acolyte II", variant: "Accelerant Decryptor" }),
        plan("Ship", { product: "A" }, { variantChoices: new Map([["Acolyte II", "Accelerant Decryptor"]]) }),
      ],
    );
    const after = saved(
      saveRecipe(data, draft("Acolyte II", [["Robotics", 1]], { type: "T2 Manufacturing", variant: "Accelerant" }), {
        original: { product: "Acolyte II", variant: "Accelerant Decryptor" },
      }),
    );
    expect(after.plans[0]!.target).toEqual({ product: "Acolyte II", variant: "Accelerant" });
    expect(after.plans[1]!.variantChoices).toEqual(new Map([["Acolyte II", "Accelerant"]]));
  });

  it("refuses to change the product of a recipe an incomplete plan builds, naming the plan", () => {
    const data = library(
      [recipe("A", { B: 1 })],
      [plan("Some As", { product: "A" }), plan("Old", { product: "A" }, { completed: "2026-10-05T10:00:00+02:00" })],
    );
    expect(problems(data, draft("C", [["B", 1]]), { original: { product: "A" } })).toEqual([
      { field: "product", kind: "targetedByPlans", plans: ["Some As"] },
    ]);
  });

  it("reports a recipe that no longer exists", () => {
    expect(problems(library(), draft("A", [["B", 1]]), { original: { product: "A" } })).toEqual([
      { field: "product", kind: "notFound", recipe: { product: "A" } },
    ]);
  });
});
