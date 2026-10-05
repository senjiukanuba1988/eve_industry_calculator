// Quantities in these fixtures are made up to exercise the rules; they are not real EVE
// Online recipes.

import type { PlanStep, Recipe, RecipeType } from "../data/model";
import { calculate, type CalculationInput, type CalculationResult } from "./calculate";

function recipe(
  product: string,
  output: number,
  inputs: Record<string, number>,
  type: RecipeType = "T1 Manufacturing",
  variant?: string,
): Recipe {
  return { product, variant, type, output, inputs: new Map(Object.entries(inputs)) };
}

type Ok = Extract<CalculationResult, { ok: true }>;

function run(recipes: Recipe[], target: string, runs: number, more: Partial<CalculationInput> = {}): Ok {
  const result = calculate({
    recipes,
    target: { product: target },
    runs,
    available: new Map(),
    variantChoices: new Map(),
    steps: [],
    ...more,
  });
  if (!result.ok) {
    throw new Error(result.reason);
  }
  return result;
}

const stock = (q: Record<string, number>) => new Map(Object.entries(q));
const builds = (r: Ok) => r.builds.map((b) => `${b.product} x${b.runs}${b.state === "started" ? " (started)" : ""}`);
const acquire = (r: Ok) => Object.fromEntries(r.acquire.map((a) => [a.item, a.quantity]));
const build = (r: Ok, product: string) => r.builds.find((b) => b.product === product && b.state === "notStarted");

/** A T2-like tree: manufacturing over planetary and reaction chains. */
const ACOLYTE: Recipe[] = [
  recipe("Acolyte II", 1, { "Acolyte I": 1, Robotics: 2, "Tungsten Carbide": 50, Morphite: 3 }, "T2 Manufacturing"),
  recipe("Acolyte I", 1, { Tritanium: 1000, Pyerite: 200 }),
  recipe("Robotics", 1, { "Consumer Electronics": 10, "Mechanical Parts": 10 }, "Planetary Industry"),
  recipe("Consumer Electronics", 5, { "Toxic Metals": 40, Chiral: 40 }, "Planetary Industry"),
  recipe("Mechanical Parts", 5, { "Reactive Metals": 40, "Precious Metals": 40 }, "Planetary Industry"),
  recipe("Tungsten Carbide", 10000, { "Rolled Tungsten Alloy": 98, "Sulfuric Acid": 98 }, "Reaction"),
  recipe("Rolled Tungsten Alloy", 200, { Tungsten: 100, Platinum: 100 }, "Reaction"),
  recipe("Sulfuric Acid", 200, { Hydrocarbons: 100, Evaporite: 100 }, "Reaction"),
];

describe("recursive expansion down to base materials", () => {
  it("expands every tier through to items no recipe produces, listing each base material once", () => {
    const r = run(ACOLYTE, "Acolyte II", 30);
    expect(r.baseMaterials.map((m) => m.item)).toEqual([
      "Chiral",
      "Evaporite",
      "Hydrocarbons",
      "Morphite",
      "Platinum",
      "Precious Metals",
      "Pyerite",
      "Reactive Metals",
      "Toxic Metals",
      "Tritanium",
      "Tungsten",
    ]);
    // 30 Acolyte II need 60 Robotics -> 600 Consumer Electronics (120 runs) -> 4,800 Toxic Metals.
    expect(acquire(r)["Toxic Metals"]).toBe(4800);
    // 1,500 Tungsten Carbide is one run: 98 of each input -> one run each of the alloys.
    expect(acquire(r).Tungsten).toBe(100);
    expect(acquire(r).Tritanium).toBe(30000);
  });

  it("adds up a base material reached by several paths", () => {
    const recipes = [recipe("X", 1, { A: 1, B: 1, Tritanium: 5 }), recipe("A", 1, { Tritanium: 10 }), recipe("B", 1, { Tritanium: 100 })];
    const r = run(recipes, "X", 2);
    expect(r.baseMaterials).toEqual([{ item: "Tritanium", needed: 230, covered: 0, toAcquire: 230 }]);
  });
});

describe("whole runs and leftover", () => {
  it("makes one run when demand is smaller than one batch, reporting the leftover", () => {
    const r = run([recipe("X", 1, { TC: 600 }), recipe("TC", 10000, { Ore: 1 }, "Reaction")], "X", 1);
    expect(build(r, "TC")).toMatchObject({ runs: 1, output: 10000, leftover: 9400 });
  });

  it("rounds up to whole runs when demand spans several batches", () => {
    const r = run([recipe("X", 1, { P: 12 }), recipe("P", 5, { Ore: 1 }, "Planetary Industry")], "X", 1);
    expect(build(r, "P")).toMatchObject({ runs: 3, output: 15, leftover: 3 });
  });

  it("lets two consumers share one batch", () => {
    const recipes = [
      recipe("X", 1, { A: 1, B: 1 }),
      recipe("A", 1, { TC: 600 }),
      recipe("B", 1, { TC: 600 }),
      recipe("TC", 10000, { Ore: 1 }, "Reaction"),
    ];
    const r = run(recipes, "X", 1);
    expect(r.builds.filter((b) => b.product === "TC")).toHaveLength(1);
    expect(build(r, "TC")).toMatchObject({ runs: 1, leftover: 8800 });
  });

  it("keeps every new entry's leftover below one run's output", () => {
    const r = run(ACOLYTE, "Acolyte II", 37, { available: stock({ Robotics: 3, "Consumer Electronics": 7 }) });
    for (const b of r.builds.filter((b) => !b.isTarget)) {
      expect(b.leftover).toBeLessThan(b.output / b.runs);
      expect(b.leftover).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("available material is used first, at every tier", () => {
  it("builds only what a partly stocked intermediate still lacks, and only its inputs for that", () => {
    const recipes = [
      recipe("X", 1, { Robotics: 10 }),
      recipe("Robotics", 1, { "Reactive Metals": 3, "Consumer Electronics": 2 }, "Planetary Industry"),
    ];
    const r = run(recipes, "X", 1, { available: stock({ Robotics: 4 }) });
    expect(build(r, "Robotics")).toMatchObject({ runs: 6 });
    expect(acquire(r)).toEqual({ "Reactive Metals": 18, "Consumer Electronics": 12 });
    expect(r.fromAvailable).toEqual(stock({ Robotics: 4 }));
  });

  it("still lists a fully covered material, with nothing to acquire", () => {
    const r = run([recipe("X", 1, { Tritanium: 4750 })], "X", 1, { available: stock({ Tritanium: 1000000 }) });
    expect(r.baseMaterials).toEqual([{ item: "Tritanium", needed: 4750, covered: 4750, toAcquire: 0 }]);
    expect(r.acquire).toEqual([]);
  });

  it("always builds the full target, however much of it is held, and does not count it", () => {
    const r = run([recipe("X", 1, { A: 1 })], "X", 5, { available: stock({ X: 20 }) });
    expect(build(r, "X")).toMatchObject({ runs: 5, isTarget: true });
    expect(r.fromAvailable.has("X")).toBe(false);
  });

  it("drops a covered intermediate together with everything below it", () => {
    const r = run(ACOLYTE, "Acolyte II", 30, { available: stock({ Robotics: 60 }) });
    expect(builds(r).some((b) => /Robotics|Consumer|Mechanical/.test(b))).toBe(false);
    expect(r.baseMaterials.some((m) => m.item === "Toxic Metals")).toBe(false);
  });

  it("reserving across tiers: takes 2 y and 10 z held, and 26 a and 26 b for the 13 y still to make", () => {
    const recipes = [recipe("X", 1, { y: 3, z: 2 }), recipe("y", 1, { a: 2, b: 2 })];
    const r = run(recipes, "X", 5, { available: stock({ y: 2, z: 12, a: 50, b: 50 }) });
    expect(r.fromAvailable).toEqual(stock({ y: 2, z: 10, a: 26, b: 26 }));
    expect(build(r, "y")).toMatchObject({ runs: 13 });
    expect(r.acquire).toEqual([]);
  });
});

describe("variants", () => {
  const recipes = [
    recipe("Ship", 1, { "Acolyte II": 5, Tritanium: 10 }),
    recipe("Acolyte II", 1, { Robotics: 1 }, "T2 Manufacturing", "Accelerant Decryptor"),
    recipe("Acolyte II", 2, { Robotics: 3 }, "T2 Manufacturing", "Symmetry Decryptor"),
  ];

  it("asks for a choice instead of guessing or failing, and calculates the rest", () => {
    const r = run(recipes, "Ship", 1);
    expect(r.choicesNeeded).toEqual([{ product: "Acolyte II", variants: ["Accelerant Decryptor", "Symmetry Decryptor"], stillNeeded: 5 }]);
    expect(builds(r)).toEqual(["Ship x1"]);
    expect(acquire(r)).toEqual({ Tritanium: 10 });
  });

  it("uses the chosen variant", () => {
    const r = run(recipes, "Ship", 1, { variantChoices: new Map([["Acolyte II", "Symmetry Decryptor"]]) });
    expect(build(r, "Acolyte II")).toMatchObject({ runs: 3, recipe: { product: "Acolyte II", variant: "Symmetry Decryptor" } });
    expect(r.choicesNeeded).toEqual([]);
  });

  it("flags a remembered choice that no longer names a recipe, and asks again", () => {
    const r = run(recipes, "Ship", 1, { variantChoices: new Map([["Acolyte II", "Gone"]]) });
    expect(r.choicesNeeded[0]).toMatchObject({ product: "Acolyte II", invalidChoice: "Gone" });
  });

  it("asks nothing when the intermediate is covered by available material", () => {
    expect(run(recipes, "Ship", 1, { available: stock({ "Acolyte II": 5 }) }).choicesNeeded).toEqual([]);
  });

  it("uses a sole recipe without asking, labelled or not", () => {
    const r = run(
      [recipe("Ship", 1, { "Acolyte II": 1 }), recipe("Acolyte II", 1, { Robotics: 1 }, "T2 Manufacturing", "Only")],
      "Ship",
      1,
    );
    expect(r.choicesNeeded).toEqual([]);
    expect(build(r, "Acolyte II")).toBeDefined();
  });

  it("targets the variant the plan names", () => {
    const result = calculate({
      recipes,
      target: { product: "Acolyte II", variant: "Symmetry Decryptor" },
      runs: 4,
      available: new Map(),
      variantChoices: new Map(),
      steps: [],
    });
    expect(result.ok && result.builds).toEqual([
      expect.objectContaining({ runs: 4, output: 8, recipe: { product: "Acolyte II", variant: "Symmetry Decryptor" } }),
    ]);
  });

  it("reports a target whose recipe is missing", () => {
    expect(
      calculate({ recipes, target: { product: "Nope" }, runs: 1, available: new Map(), variantChoices: new Map(), steps: [] }),
    ).toEqual({
      ok: false,
      reason: "targetMissing",
    });
  });
});

describe("build order", () => {
  it("puts every entry after the entries making its inputs, reactions before what consumes them, the target last", () => {
    const r = run(ACOLYTE, "Acolyte II", 30);
    const made = new Set<string>();
    for (const b of r.builds) {
      for (const input of b.inputs.keys()) {
        const producer = r.builds.find((x) => x.product === input);
        if (producer) {
          expect(made.has(input), `${input} before ${b.product}`).toBe(true);
        }
      }
      made.add(b.product);
    }
    expect(r.builds.at(-1)).toMatchObject({ product: "Acolyte II", isTarget: true });
    // By tier (steps above base materials), then by name.
    expect(builds(r)).toEqual([
      "Acolyte I x30",
      "Consumer Electronics x120",
      "Mechanical Parts x120",
      "Rolled Tungsten Alloy x1",
      "Sulfuric Acid x1",
      "Robotics x60",
      "Tungsten Carbide x1",
      "Acolyte II x30",
    ]);
  });

  it("gives the same order however the recipes and their inputs happen to be listed", () => {
    const shuffled = [...ACOLYTE].reverse().map((r) => ({ ...r, inputs: new Map([...r.inputs].reverse()) }));
    expect(builds(run(shuffled, "Acolyte II", 30))).toEqual(builds(run(ACOLYTE, "Acolyte II", 30)));
    expect(builds(run(ACOLYTE, "Acolyte II", 30))).toEqual(builds(run(ACOLYTE, "Acolyte II", 30)));
  });
});

describe("started and done steps", () => {
  const recipes = [recipe("X", 1, { Robotics: 10 }), recipe("Robotics", 1, { "Reactive Metals": 3 }, "Planetary Industry")];
  const started = (product: string, runs: number, outputPerRun: number, inputsPerRun: Record<string, number>): PlanStep => ({
    state: "started",
    product,
    runs,
    inputsPerRun: new Map(Object.entries(inputsPerRun)),
    outputPerRun,
    takenFrom: "general",
    deducted: new Map(Object.entries(inputsPerRun).map(([k, v]) => [k, v * runs])),
    started: "2026-10-05T10:00:00+02:00",
  });

  it("does not ask again for started work, nor for its inputs", () => {
    const r = run(recipes, "X", 1, { steps: [started("Robotics", 10, 1, { "Reactive Metals": 3 })] });
    expect(builds(r)).toEqual(["Robotics x10 (started)", "X x1"]);
    expect(r.acquire).toEqual([]);
  });

  it("keeps a started step when stock for it arrives, its output now leftover", () => {
    const r = run(recipes, "X", 1, { steps: [started("Robotics", 10, 1, { "Reactive Metals": 3 })], available: stock({ Robotics: 10 }) });
    expect(r.builds[0]).toMatchObject({ product: "Robotics", state: "started", step: 0, leftover: 10 });
  });

  it("uses the figures recorded on a started step, not the recipe as edited since", () => {
    // Started at 200 per run; the recipe now says 220.
    const edited = [recipe("X", 1, { R: 1150 }), recipe("R", 220, { Ore: 1 }, "Reaction")];
    const r = run(edited, "X", 1, { steps: [started("R", 5, 200, { Ore: 1 })] });
    expect(r.builds[0]).toMatchObject({ state: "started", runs: 5, output: 1000 });
    // 1,000 on its way; the other 150 need one more run of the recipe as it is now.
    expect(build(r, "R")).toMatchObject({ runs: 1, output: 220, leftover: 70 });
  });

  it("does not build the target again while its step is started", () => {
    const r = run(recipes, "X", 1, { steps: [started("X", 1, 1, { Robotics: 10 })] });
    expect(builds(r)).toEqual(["X x1 (started)"]);
    expect(r.acquire).toEqual([]);
  });

  it("keeps a started step the tree no longer needs, just before the target", () => {
    const r = run(recipes, "X", 1, { steps: [started("Old Part", 2, 1, { Ore: 1 })], available: stock({ Robotics: 10 }) });
    expect(builds(r)).toEqual(["Old Part x2 (started)", "X x1"]);
  });

  it("counts done intermediates only through the stock they produced", () => {
    const done: PlanStep = {
      ...started("Robotics", 10, 1, { "Reactive Metals": 3 }),
      state: "done",
      done: "2026-10-05T11:00:00+02:00",
      addedToReserved: 0,
      addedToGeneral: 10,
    };
    // The output was used elsewhere: the plan has to make it again.
    expect(builds(run(recipes, "X", 1, { steps: [done] }))).toEqual(["Robotics x10", "X x1"]);
    expect(builds(run(recipes, "X", 1, { steps: [done], available: stock({ Robotics: 10 }) }))).toEqual(["X x1"]);
  });
});

describe("the calculation explains itself", () => {
  it("traces why a step calls for 5 runs: demand, where it came from, what was covered, the rounding", () => {
    const recipes = [
      recipe("X", 1, { A: 1, B: 1 }),
      recipe("A", 1, { P: 12 }),
      recipe("B", 1, { P: 9 }),
      recipe("P", 4, { Ore: 1 }, "Planetary Industry"),
    ];
    const r = run(recipes, "X", 1, { available: stock({ P: 2 }) });
    expect(r.trace.get("P")).toEqual({
      item: "P",
      how: "build",
      demandFrom: [
        { consumer: "A", quantity: 12 },
        { consumer: "B", quantity: 9 },
      ],
      totalDemand: 21,
      fromAvailable: 2,
      onItsWay: 0,
      remaining: 19,
      outputPerRun: 4,
      runs: 5,
      produced: 20,
      leftover: 1,
    });
    expect(build(r, "P")).toMatchObject({ runs: 5, leftover: 1 });
  });

  it("traces a shared batch to both consumers", () => {
    const recipes = [
      recipe("X", 1, { A: 1, B: 1 }),
      recipe("A", 1, { TC: 600 }),
      recipe("B", 1, { TC: 600 }),
      recipe("TC", 10000, { Ore: 1 }, "Reaction"),
    ];
    expect(run(recipes, "X", 1).trace.get("TC")).toMatchObject({
      demandFrom: [
        { consumer: "A", quantity: 600 },
        { consumer: "B", quantity: 600 },
      ],
      totalDemand: 1200,
      runs: 1,
      leftover: 8800,
    });
  });

  it("traces a base material, a covered intermediate, output on its way, and the target", () => {
    const recipes = [recipe("X", 2, { Robotics: 10, Tritanium: 5 }), recipe("Robotics", 1, { Ore: 3 }, "Planetary Industry")];
    const started: PlanStep = {
      state: "started",
      product: "Robotics",
      runs: 3,
      inputsPerRun: new Map([["Ore", 3]]),
      outputPerRun: 1,
      takenFrom: "general",
      deducted: new Map([["Ore", 9]]),
      started: "2026-10-05T10:00:00+02:00",
    };
    const r = run(recipes, "X", 4, { available: stock({ Robotics: 15, Tritanium: 7 }), steps: [started] });
    expect(r.trace.get("Tritanium")).toMatchObject({ how: "acquire", totalDemand: 20, fromAvailable: 7, remaining: 13 });
    expect(r.trace.get("Robotics")).toMatchObject({
      how: "build",
      totalDemand: 40,
      fromAvailable: 15,
      onItsWay: 3,
      remaining: 22,
      runs: 22,
    });
    expect(r.trace.get("X")).toMatchObject({ how: "target", totalDemand: 8, fromAvailable: 0, runs: 4, produced: 8 });
  });

  it("adds up for every item of a deep tree with stock and started work", () => {
    const r = run(ACOLYTE, "Acolyte II", 37, {
      available: stock({ Robotics: 3, "Consumer Electronics": 7, Tritanium: 5000, "Sulfuric Acid": 50 }),
    });
    expect(r.trace.size).toBeGreaterThan(10);
    for (const t of r.trace.values()) {
      expect(t.fromAvailable + t.onItsWay + t.remaining, t.item).toBe(t.totalDemand);
      if (t.how !== "target") {
        expect(
          t.demandFrom.reduce((n, d) => n + d.quantity, 0),
          t.item,
        ).toBe(t.totalDemand);
      }
      if (t.how === "build") {
        expect(t.produced, t.item).toBe(t.runs! * t.outputPerRun!);
        expect(t.produced! - t.leftover!, t.item).toBe(t.remaining);
        if (t.runs! > 0) {
          expect(build(r, t.item), t.item).toMatchObject({ runs: t.runs, leftover: t.leftover });
        }
      }
    }
  });
});
