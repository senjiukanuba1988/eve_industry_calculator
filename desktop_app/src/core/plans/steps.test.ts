import { emptyData } from "../data/format";
import { loadData, type DataFileTexts } from "../data/load";
import { DATA_FILES, type AppData, type Plan, type Recipe } from "../data/model";
import { serializeFile } from "../data/serialize";
import { isRefusal, type Refusal } from "../refusal";
import { calculatePlan } from "./plans";
import { completeDirectly, completeStep, revertShortfall, revertStep, startShortfall, startStep, type StepRefusal } from "./steps";

const T0 = "2026-10-06T10:00:00+02:00";
const T1 = "2026-10-06T12:00:00+02:00";
const AT = { index: 0, name: "Ship" };

/**
 * One Ship takes `carbidePerShip` Carbide; Carbide is a reaction yielding 200 per run from
 * 98 Sulfuric Acid. 1,000 Carbide is 5 runs (490 acid); 1,150 is 6 runs, 50 left over.
 */
function data(carbidePerShip: number, stock: Array<[string, number]>, plan: Partial<Plan> = {}): AppData {
  const recipes: Recipe[] = [
    { product: "Ship", type: "T1 Manufacturing", output: 1, inputs: new Map([["Carbide", carbidePerShip]]) },
    { product: "Carbide", type: "Reaction", output: 200, inputs: new Map([["Sulfuric Acid", 98]]) },
  ];
  return {
    ...emptyData("1.0.0"),
    items: { categories: new Map(), uncategorised: ["Carbide", "Ship", "Sulfuric Acid"] },
    recipes,
    hangar: { stock: new Map(stock) },
    plans: [{ name: "Ship", target: { product: "Ship" }, runs: 1, created: T0, variantChoices: new Map(), steps: [], ...plan }],
  };
}

/** The outcome, which must be saveable: it is written and loaded again, as the store does. */
function ok(outcome: AppData | Refusal<StepRefusal>): AppData {
  if (isRefusal(outcome)) {
    throw new Error(`refused: ${JSON.stringify(outcome.refused)}`);
  }
  const texts = Object.fromEntries(DATA_FILES.map((f) => [f, serializeFile(f, outcome)])) as DataFileTexts;
  const loaded = loadData(texts);
  if (!loaded.ok) {
    throw new Error(`would not load again: ${JSON.stringify(loaded.errors)}`);
  }
  return outcome;
}

const carbide = (runs: number) => ({ product: "Carbide", runs });
const plan = (d: AppData) => d.plans[0]!;
const stock = (d: AppData, item: string) => d.hangar.stock.get(item) ?? 0;

describe("starting a step", () => {
  it("starting a reaction deducts its inputs from the hangar and fixes the step", () => {
    const d = ok(startStep(data(1000, [["Sulfuric Acid", 600]]), AT, carbide(5), T1));
    expect(stock(d, "Sulfuric Acid")).toBe(110);
    expect(plan(d).steps).toEqual([
      {
        state: "started",
        product: "Carbide",
        variant: undefined,
        runs: 5,
        inputsPerRun: new Map([["Sulfuric Acid", 98]]),
        outputPerRun: 200,
        takenFrom: "general",
        deducted: new Map([["Sulfuric Acid", 490]]),
        started: T1,
      },
    ]);
  });

  it("starting a step in a reserved plan takes from its pile and leaves general stock alone", () => {
    const d = ok(startStep(data(1000, [["Sulfuric Acid", 600]], { reserved: new Map([["Sulfuric Acid", 490]]) }), AT, carbide(5), T1));
    expect(plan(d).reserved).toEqual(new Map());
    expect(stock(d, "Sulfuric Acid")).toBe(600);
    expect(plan(d).steps[0]!.takenFrom).toBe("reserved");
  });

  it("starting with too little clamps at zero and records the shortfall", () => {
    // 1 run of Carbide needs 98 acid; with 60 held it is 38 short.
    const before = data(200, [["Sulfuric Acid", 60]]);
    expect(startShortfall(before, AT, carbide(1))).toEqual(new Map([["Sulfuric Acid", 38]]));
    const d = ok(startStep(before, AT, carbide(1), T1));
    expect(d.hangar.stock.has("Sulfuric Acid")).toBe(false);
    expect(plan(d).steps[0]).toMatchObject({ deducted: new Map([["Sulfuric Acid", 60]]), short: new Map([["Sulfuric Acid", 38]]) });
  });

  it("asking what would be short changes nothing, so declining the warning leaves everything as it was", () => {
    const before = data(200, [["Sulfuric Acid", 60]]);
    startShortfall(before, AT, carbide(1));
    expect(before.hangar.stock.get("Sulfuric Acid")).toBe(60);
    expect(plan(before).steps).toEqual([]);
  });

  it("refuses an entry that no longer reads as shown", () => {
    const outcome = startStep(data(1000, []), AT, carbide(4), T1);
    expect(isRefusal(outcome) && outcome.refused).toEqual({ kind: "entryChanged", product: "Carbide" });
  });

  it("started work is not asked for again", () => {
    const d = ok(startStep(data(1000, [["Sulfuric Acid", 490]]), AT, carbide(5), T1));
    const result = calculatePlan(d, plan(d));
    expect(result.ok && result.builds.map((b) => `${b.product} ${b.state}`)).toEqual(["Carbide started", "Ship notStarted"]);
    expect(result.ok && result.acquire).toEqual([]);
  });
});

describe("completing a step", () => {
  it("batch surplus from a reserved plan: the need goes to the pile, the surplus to general stock", () => {
    let d = data(1150, [], { reserved: new Map([["Sulfuric Acid", 588]]) });
    d = ok(startStep(d, AT, carbide(6), T0));
    d = ok(completeStep(d, AT, { index: 0, product: "Carbide", state: "started" }, T1));
    expect(plan(d).reserved).toEqual(new Map([["Carbide", 1150]]));
    expect(stock(d, "Carbide")).toBe(50);
    expect(plan(d).steps[0]).toMatchObject({ state: "done", done: T1, started: T0, addedToReserved: 1150, addedToGeneral: 50 });
  });

  it("a step completed in an unreserved plan puts all of its output into general stock", () => {
    let d = data(1150, [["Sulfuric Acid", 588]]);
    d = ok(startStep(d, AT, carbide(6), T0));
    d = ok(completeStep(d, AT, { index: 0, product: "Carbide", state: "started" }, T1));
    expect(stock(d, "Carbide")).toBe(1200);
    expect(plan(d).steps[0]).toMatchObject({ addedToReserved: 0, addedToGeneral: 1200 });
  });

  it("a recipe edited while its job runs: done adds the figure recorded at the start", () => {
    let d = data(1000, [["Sulfuric Acid", 490]]);
    d = ok(startStep(d, AT, carbide(5), T0));
    d = { ...d, recipes: d.recipes.map((r) => (r.product === "Carbide" ? { ...r, output: 220 } : r)) };
    d = ok(completeStep(d, AT, { index: 0, product: "Carbide", state: "started" }, T1));
    expect(stock(d, "Carbide")).toBe(1000);
  });

  it("completing without starting, deducting: inputs out, output in, no start time", () => {
    const d = ok(completeDirectly(data(1000, [["Sulfuric Acid", 500]]), AT, carbide(5), T1, true));
    expect(stock(d, "Sulfuric Acid")).toBe(10);
    expect(stock(d, "Carbide")).toBe(1000);
    expect(plan(d).steps[0]).toMatchObject({ state: "done", done: T1, deducted: new Map([["Sulfuric Acid", 490]]) });
    expect(plan(d).steps[0]!.started).toBeUndefined();
  });

  it("completing without starting, recording the output only", () => {
    const d = ok(completeDirectly(data(1000, [["Sulfuric Acid", 500]]), AT, carbide(5), T1, false));
    expect(stock(d, "Sulfuric Acid")).toBe(500);
    expect(stock(d, "Carbide")).toBe(1000);
    expect(plan(d).steps[0]!.deducted).toBeUndefined();
  });

  it("another plan uses the output: the done step stays done and the plan asks to build again", () => {
    let d = ok(completeDirectly(data(1000, [["Sulfuric Acid", 500]]), AT, carbide(5), T1, true));
    d = { ...d, hangar: { stock: new Map() } };
    const result = calculatePlan(d, plan(d));
    expect(plan(d).steps[0]!.state).toBe("done");
    expect(result.ok && result.builds.map((b) => `${b.product} ${b.runs}`)).toEqual(["Carbide 5", "Ship 1"]);
  });
});

describe("working on two projects at once", () => {
  it("starting and completing a step in one plan leaves the other plan's steps alone", () => {
    const base = data(1000, [["Sulfuric Acid", 2000]]);
    const other: Plan = { ...base.plans[0]!, name: "Other ship", steps: [] };
    let d: AppData = { ...base, plans: [base.plans[0]!, other] };
    d = ok(startStep(d, { index: 1, name: "Other ship" }, carbide(5), T0));
    const otherSteps = d.plans[1]!.steps;

    d = ok(startStep(d, AT, carbide(5), T1));
    d = ok(completeStep(d, AT, { index: 0, product: "Carbide", state: "started" }, T1));
    expect(plan(d).steps.map((s) => s.state)).toEqual(["done"]);
    expect(d.plans[1]!.steps).toBe(otherSteps);
  });
});

describe("finishing a plan", () => {
  it("completes when the target step is done, and returns the whole pile, product included, to general stock", () => {
    // 300 acid in the pile it turned out not to need.
    let d = data(1000, [], { reserved: new Map([["Carbide", 1000], ["Sulfuric Acid", 300]]) });
    d = ok(startStep(d, AT, { product: "Ship", runs: 1 }, T0));
    d = ok(completeStep(d, AT, { index: 0, product: "Ship", state: "started" }, T1));
    expect(plan(d).completed).toBe(T1);
    expect(plan(d).reserved).toBeUndefined();
    expect(d.hangar.stock).toEqual(new Map([["Sulfuric Acid", 300], ["Ship", 1]]));
  });

  it("completes an unreserved plan too, adding the product once", () => {
    const d = ok(completeDirectly(data(1000, [["Carbide", 1000]]), AT, { product: "Ship", runs: 1 }, T1, true));
    expect(plan(d).completed).toBe(T1);
    expect(stock(d, "Ship")).toBe(1);
  });

  it("an intermediate step being done does not complete the plan", () => {
    const d = ok(completeDirectly(data(1000, [["Sulfuric Acid", 500]]), AT, carbide(5), T1, true));
    expect(plan(d).completed).toBeUndefined();
  });

  it("refuses to work steps of a completed plan", () => {
    const d = data(1000, [], { completed: T1 });
    const outcome = startStep(d, AT, carbide(5), T1);
    expect(isRefusal(outcome) && outcome.refused.kind).toBe("planCompleted");
  });
});

describe("reverting a step", () => {
  const started = { index: 0, product: "Carbide", state: "started" as const };
  const done = { index: 0, product: "Carbide", state: "done" as const };

  it("undoing a completed step removes its output from where it went and keeps the start time", () => {
    let d = data(1150, [], { reserved: new Map([["Sulfuric Acid", 588]]) });
    d = ok(startStep(d, AT, carbide(6), T0));
    d = ok(completeStep(d, AT, started, T1));
    d = ok(revertStep(d, AT, done));
    expect(plan(d).reserved).toEqual(new Map());
    expect(d.hangar.stock.has("Carbide")).toBe(false);
    expect(plan(d).steps[0]).toMatchObject({ state: "started", started: T0 });
    expect(plan(d).steps[0]!.done).toBeUndefined();
    expect(plan(d).steps[0]!.addedToGeneral).toBeUndefined();
  });

  it("undoing a started step returns what was deducted and drops the step", () => {
    let d = data(1000, [["Sulfuric Acid", 600]]);
    d = ok(startStep(d, AT, carbide(5), T0));
    d = ok(revertStep(d, AT, started));
    expect(stock(d, "Sulfuric Acid")).toBe(600);
    expect(plan(d).steps).toEqual([]);
  });

  it("undoing a step started short returns what was taken, not what was needed", () => {
    let d = data(200, [["Sulfuric Acid", 60]]);
    d = ok(startStep(d, AT, carbide(1), T0));
    d = ok(revertStep(d, AT, started));
    expect(stock(d, "Sulfuric Acid")).toBe(60);
  });

  it("undoing a started step of a reserved plan returns to the pile, or to general stock once released", () => {
    let d = data(1000, [], { reserved: new Map([["Sulfuric Acid", 490]]) });
    d = ok(startStep(d, AT, carbide(5), T0));
    expect(plan(ok(revertStep(d, AT, started))).reserved).toEqual(new Map([["Sulfuric Acid", 490]]));

    d = { ...d, plans: [{ ...plan(d), reserved: undefined }] };
    d = ok(revertStep(d, AT, started));
    expect(stock(d, "Sulfuric Acid")).toBe(490);
  });

  it("material already spent: removal clamps at zero and records what could not be removed", () => {
    let d = data(1000, [["Sulfuric Acid", 490]]);
    d = ok(startStep(d, AT, carbide(5), T0));
    d = ok(completeStep(d, AT, started, T1));
    d = { ...d, hangar: { stock: new Map([["Carbide", 300]]) } };
    expect(revertShortfall(d, AT, done)).toBe(700);
    d = ok(revertStep(d, AT, done));
    expect(d.hangar.stock.has("Carbide")).toBe(false);
    expect(plan(d).steps[0]).toMatchObject({ state: "started", notRemoved: 700 });
  });

  it("a step done without starting goes straight back to not started, returning its inputs", () => {
    let d = ok(completeDirectly(data(1000, [["Sulfuric Acid", 500]]), AT, carbide(5), T1, true));
    d = ok(revertStep(d, AT, done));
    expect(plan(d).steps).toEqual([]);
    expect(d.hangar.stock).toEqual(new Map([["Sulfuric Acid", 500]]));
  });

  it("refuses a step that is no longer what the screen showed", () => {
    const d = ok(startStep(data(1000, [["Sulfuric Acid", 600]]), AT, carbide(5), T0));
    const outcome = revertStep(d, AT, done);
    expect(isRefusal(outcome) && outcome.refused.kind).toBe("stepNotFound");
  });
});
