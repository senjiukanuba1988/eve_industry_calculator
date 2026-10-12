import { emptyData } from "../data/format";
import { fixtureTexts } from "../data/fixtures/fixture";
import { loadData, type DataFileTexts } from "../data/load";
import { DATA_FILES, type AppData, type Recipe } from "../data/model";
import { serializeFile } from "../data/serialize";
import { isRefusal } from "../refusal";
import { calculatePlan, createPlan, deletePlan, removalDate, renamePlan, setVariantChoice, suggestPlanName, variantOptions } from "./plans";

function fixture(): AppData {
  const loaded = loadData(fixtureTexts());
  if (!loaded.ok) {
    throw new Error("fixture does not load");
  }
  return loaded.data;
}

const NOW = "2026-10-06T10:00:00+02:00";

function ok(outcome: ReturnType<typeof createPlan>): AppData {
  if (isRefusal(outcome)) {
    throw new Error(`refused: ${JSON.stringify(outcome.refused)}`);
  }
  return outcome;
}

const recipe = (product: string, output: number): Recipe => ({ product, type: "Reaction", output, inputs: new Map() });

describe("suggestPlanName", () => {
  it("names the quantity the plan produces and the product, without a plural", () => {
    expect(suggestPlanName(recipe("Flycatcher", 1), 80)).toBe("80 Flycatcher");
    expect(suggestPlanName(recipe("Acolyte II", 1), 30)).toBe("30 Acolyte II");
  });

  it("uses the output, not the runs, with thousands separators", () => {
    expect(suggestPlanName(recipe("Tungsten Carbide", 10000), 5)).toBe("50,000 Tungsten Carbide");
  });
});

describe("createPlan", () => {
  it("adds a plan with the target, runs, name and creation time, and nothing else yet", () => {
    const data = ok(createPlan(fixture(), { target: { product: "Robotics" }, runs: 10, name: "  10 Robotics " }, NOW));
    const plan = data.plans.at(-1)!;
    expect(plan).toEqual({
      name: "10 Robotics",
      target: { product: "Robotics", variant: undefined },
      runs: 10,
      created: NOW,
      variantChoices: new Map(),
      steps: [],
    });
    expect(data.hangar).toEqual(fixture().hangar);
  });

  it("targets the chosen variant", () => {
    const data = ok(createPlan(fixture(), { target: { product: "Acolyte II", variant: "Symmetry Decryptor" }, runs: 30, name: "x" }, NOW));
    expect(data.plans.at(-1)!.target).toEqual({ product: "Acolyte II", variant: "Symmetry Decryptor" });
  });

  it("allows a second plan with the same name", () => {
    const data = ok(createPlan(fixture(), { target: { product: "Flycatcher" }, runs: 80, name: "80 Flycatchers" }, NOW));
    expect(data.plans.filter((p) => p.name === "80 Flycatchers")).toHaveLength(2);
  });

  it.each([
    ["a recipe that does not exist", { target: { product: "Acolyte II" }, runs: 1, name: "x" }, "recipeNotFound"],
    ["zero runs", { target: { product: "Robotics" }, runs: 0, name: "x" }, "runsNotWhole"],
    ["fractional runs", { target: { product: "Robotics" }, runs: 1.5, name: "x" }, "runsNotWhole"],
    ["an empty name", { target: { product: "Robotics" }, runs: 1, name: "   " }, "nameEmpty"],
  ])("refuses %s", (_, plan, kind) => {
    const outcome = createPlan(fixture(), plan, NOW);
    expect(isRefusal(outcome) && outcome.refused.kind).toBe(kind);
  });

  it("refuses when there are no recipes at all", () => {
    expect(isRefusal(createPlan(emptyData("1.0.0"), { target: { product: "X" }, runs: 1, name: "x" }, NOW))).toBe(true);
  });

  it("writes a plan that loads again unchanged", () => {
    const data = ok(createPlan(fixture(), { target: { product: "Acolyte II", variant: "Symmetry Decryptor" }, runs: 3, name: "p" }, NOW));
    const texts = Object.fromEntries(DATA_FILES.map((f) => [f, serializeFile(f, data)])) as DataFileTexts;
    const reloaded = loadData(texts);
    expect(reloaded.ok && reloaded.data.plans.at(-1)).toEqual({ ...data.plans.at(-1), target: { product: "Acolyte II", variant: "Symmetry Decryptor" } });
  });
});

describe("renamePlan", () => {
  it("changes only the name", () => {
    const before = fixture();
    const after = ok(renamePlan(before, { index: 0, name: "80 Flycatchers" }, "Flycatchers for the corp"));
    expect(after.plans[0]).toEqual({ ...before.plans[0], name: "Flycatchers for the corp" });
    expect(after.plans[1]).toEqual(before.plans[1]);
    expect(after.hangar).toEqual(before.hangar);
  });

  it("refuses an empty name and a plan that is not there any more", () => {
    const data = fixture();
    const empty = renamePlan(data, { index: 0, name: "80 Flycatchers" }, " ");
    expect(isRefusal(empty) && empty.refused.kind).toBe("nameEmpty");
    const gone = renamePlan(data, { index: 0, name: "30 Acolyte II" }, "y");
    expect(isRefusal(gone) && gone.refused.kind).toBe("planNotFound");
  });
});

describe("deletePlan", () => {
  it("deleting a reserved plan with work done returns the pile and nothing else", () => {
    // Scenario: deleting a reserved plan with work done. The fixture's plan has a done step
    // (output went to its pile) and a started step (inputs already left the pile).
    const before = fixture();
    const after = ok(deletePlan(before, { index: 0, name: "80 Flycatchers" }));
    expect(after.plans.map((p) => p.name)).toEqual(["30 Acolyte II"]);
    expect(after.hangar.stock).toEqual(new Map([...before.hangar.stock, ["Construction Blocks", 500 + 2000], ["Robotics", 4]]));
    // The consumed Rolled Tungsten Alloy and Sulfuric Acid are not returned.
    expect(after.hangar.stock.get("Sulfuric Acid")).toBe(before.hangar.stock.get("Sulfuric Acid"));
    expect(after.hangar.stock.has("Rolled Tungsten Alloy")).toBe(false);
  });

  it("deleting an unreserved plan leaves the hangar alone", () => {
    const before = fixture();
    const after = ok(deletePlan(before, { index: 1, name: "30 Acolyte II" }));
    expect(after.plans.map((p) => p.name)).toEqual(["80 Flycatchers"]);
    expect(after.hangar).toEqual(before.hangar);
  });

  it("refuses when the plan at that place has another name", () => {
    const outcome = deletePlan(fixture(), { index: 1, name: "80 Flycatchers" });
    expect(isRefusal(outcome) && outcome.refused.kind).toBe("planNotFound");
  });
});

describe("variant choices", () => {
  const withAcolytePlan = () => ok(createPlan(withAcolyteUser(), { target: { product: "Drone Pack" }, runs: 2, name: "p" }, NOW));
  /** A product that uses Acolyte II, which has two variants, as an intermediate. */
  function withAcolyteUser(): AppData {
    const data = fixture();
    const items = { ...data.items, uncategorised: [...data.items.uncategorised, "Drone Pack"] };
    const pack: Recipe = { product: "Drone Pack", type: "T1 Manufacturing", output: 1, inputs: new Map([["Acolyte II", 5]]) };
    return { ...data, items, recipes: [...data.recipes, pack] };
  }
  const last = (data: AppData) => ({ index: data.plans.length - 1, name: "p" });

  it("lists an intermediate with several recipes as a choice still to make", () => {
    const data = withAcolytePlan();
    const plan = data.plans.at(-1)!;
    const result = calculatePlan(data, plan);
    expect(result.ok && result.choicesNeeded.map((c) => c.product)).toEqual(["Acolyte II"]);
    expect(variantOptions(data, plan, result)).toEqual([
      { product: "Acolyte II", variants: ["Accelerant Decryptor", "Symmetry Decryptor"], chosen: undefined, chosenIsValid: false },
    ]);
  });

  it("remembers a choice, and the plan then builds with it", () => {
    let data = withAcolytePlan();
    data = ok(setVariantChoice(data, last(data), "Acolyte II", "Symmetry Decryptor"));
    const plan = data.plans.at(-1)!;
    const result = calculatePlan(data, plan);
    expect(result.ok && result.choicesNeeded).toEqual([]);
    expect(result.ok && result.builds.find((b) => b.product === "Acolyte II")!.recipe.variant).toBe("Symmetry Decryptor");
    expect(variantOptions(data, plan, result)[0]).toMatchObject({ chosen: "Symmetry Decryptor", chosenIsValid: true });
  });

  it("flags a remembered choice that no longer names a recipe", () => {
    let data = withAcolytePlan();
    data = ok(setVariantChoice(data, last(data), "Acolyte II", "Symmetry Decryptor"));
    data = { ...data, recipes: data.recipes.filter((r) => r.variant !== "Symmetry Decryptor") };
    const plan = data.plans.at(-1)!;
    expect(variantOptions(data, plan, calculatePlan(data, plan))[0]).toMatchObject({
      variants: ["Accelerant Decryptor"],
      chosen: "Symmetry Decryptor",
      chosenIsValid: false,
    });
  });

  it("refuses a variant that does not exist", () => {
    const data = withAcolytePlan();
    const outcome = setVariantChoice(data, last(data), "Acolyte II", "Nope");
    expect(isRefusal(outcome) && outcome.refused.kind).toBe("variantNotFound");
  });

  it("changing a choice on a reserved plan releases its reservation", () => {
    const before = fixture();
    const after = ok(setVariantChoice(before, { index: 0, name: "80 Flycatchers" }, "Acolyte II", "Symmetry Decryptor"));
    expect(after.plans[0]!.reserved).toBeUndefined();
    expect(after.plans[0]!.variantChoices.get("Acolyte II")).toBe("Symmetry Decryptor");
    expect(after.hangar.stock.get("Construction Blocks")).toBe(2500);
    expect(after.hangar.stock.get("Robotics")).toBe(4);
  });
});

describe("calculatePlan", () => {
  it("a reserved plan counts only its own pile", () => {
    const data = fixture();
    const result = calculatePlan(data, data.plans[0]!);
    expect(result.ok && result.fromAvailable.get("Construction Blocks")).toBe(2000);
    // General stock holds 1,000,000 Tritanium, which a reserved plan never sees.
    expect(result.ok && result.fromAvailable.has("Tritanium")).toBe(false);
  });

  it("an unreserved plan counts general stock", () => {
    const data = ok(createPlan(fixture(), { target: { product: "Flycatcher" }, runs: 1, name: "one" }, NOW));
    const result = calculatePlan(data, data.plans.at(-1)!);
    expect(result.ok && result.fromAvailable.get("Construction Blocks")).toBeGreaterThan(0);
  });
});

describe("removalDate", () => {
  it("is seven days after completion, across month ends", () => {
    expect(removalDate("2026-10-03T18:20:00+02:00")).toBe("2026-10-10");
    expect(removalDate("2026-12-28T23:59:59+01:00")).toBe("2027-01-04");
  });
});
