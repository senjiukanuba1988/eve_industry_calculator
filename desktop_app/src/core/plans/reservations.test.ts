import { emptyData } from "../data/format";
import type { AppData, Plan, PlanStep, Recipe } from "../data/model";
import { isRefusal, type Refusal } from "../refusal";
import { calculatePlan } from "./plans";
import { releaseReservation, reservePlan, type ReservationRefusal } from "./reservations";

const recipes: Recipe[] = [
  // The X/y/z example from the spec.
  { product: "X", type: "T1 Manufacturing", output: 1, inputs: new Map([["y", 3], ["z", 2]]) },
  { product: "y", type: "T1 Manufacturing", output: 1, inputs: new Map([["a", 2], ["b", 2]]) },
  // A Flycatcher-like target: Construction Blocks, and Robotics made from two PI products.
  { product: "Ship", type: "T2 Manufacturing", output: 1, inputs: new Map([["Construction Blocks", 25], ["Robotics", 1]]) },
  { product: "Robotics", type: "Planetary Industry", output: 1, inputs: new Map([["Consumer Electronics", 10], ["Reactive Metals", 10]]) },
  { product: "Pack", type: "T1 Manufacturing", output: 1, inputs: new Map([["Drone", 1]]) },
  { product: "Drone", variant: "A", type: "T2 Manufacturing", output: 1, inputs: new Map([["a", 1]]) },
  { product: "Drone", variant: "B", type: "T2 Manufacturing", output: 1, inputs: new Map([["b", 1]]) },
];

function plan(name: string, target: string, runs: number, fields: Partial<Plan> = {}): Plan {
  return { name, target: { product: target }, runs, created: "2026-10-01T12:00:00+02:00", variantChoices: new Map(), steps: [], ...fields };
}

function data(stock: Array<[string, number]>, plans: Plan[]): AppData {
  return { ...emptyData("1.0.0"), recipes, hangar: { stock: new Map(stock) }, plans };
}

function ok(outcome: AppData | Refusal<ReservationRefusal>): AppData {
  if (isRefusal(outcome)) {
    throw new Error(`refused: ${JSON.stringify(outcome.refused)}`);
  }
  return outcome;
}

const first = (d: AppData) => ({ index: 0, name: d.plans[0]!.name });

describe("reservePlan", () => {
  it("reserving a fully covered plan moves exactly what it needs into its pile", () => {
    const d = ok(reservePlan(data([["Construction Blocks", 2500], ["Robotics", 80]], [plan("80 Ships", "Ship", 80)]), { index: 0, name: "80 Ships" }));
    expect(d.plans[0]!.reserved).toEqual(new Map([["Construction Blocks", 2000], ["Robotics", 80]]));
    expect(d.hangar.stock).toEqual(new Map([["Construction Blocks", 500]]));
  });

  it("reserving across tiers takes intermediates held and the inputs for the rest", () => {
    const d = ok(reservePlan(data([["y", 2], ["z", 12], ["a", 50], ["b", 50]], [plan("5 X", "X", 5)]), { index: 0, name: "5 X" }));
    expect(d.plans[0]!.reserved).toEqual(new Map([["y", 2], ["z", 10], ["a", 26], ["b", 26]]));
    expect(d.hangar.stock).toEqual(new Map([["z", 2], ["a", 24], ["b", 24]]));
  });

  it("components count towards the reservation", () => {
    const stock: Array<[string, number]> = [["Construction Blocks", 250], ["Robotics", 4], ["Consumer Electronics", 60], ["Reactive Metals", 60]];
    const d = ok(reservePlan(data(stock, [plan("10 Ships", "Ship", 10)]), { index: 0, name: "10 Ships" }));
    expect(d.plans[0]!.reserved).toEqual(new Map(stock));
    expect(d.hangar.stock.size).toBe(0);
  });

  it("another plan sees less, and is asked to acquire the rest", () => {
    let d = data([["Construction Blocks", 2500], ["Robotics", 120]], [plan("80 Ships", "Ship", 80), plan("40 Ships", "Ship", 40)]);
    d = ok(reservePlan(d, { index: 0, name: "80 Ships" }));
    const second = calculatePlan(d, d.plans[1]!);
    expect(second.ok && second.acquire).toEqual([{ item: "Construction Blocks", quantity: 500 }]);
  });

  it("refuses a plan not fully covered, listing what is missing", () => {
    const outcome = reservePlan(data([["Construction Blocks", 100]], [plan("80 Ships", "Ship", 80)]), { index: 0, name: "80 Ships" });
    expect(isRefusal(outcome) && outcome.refused).toEqual({
      kind: "missing",
      missing: [
        { item: "Construction Blocks", quantity: 1900 },
        { item: "Consumer Electronics", quantity: 800 },
        { item: "Reactive Metals", quantity: 800 },
      ],
    });
  });

  it("refuses while a recipe choice is outstanding", () => {
    const outcome = reservePlan(data([["a", 5], ["b", 5]], [plan("Packs", "Pack", 2)]), { index: 0, name: "Packs" });
    expect(isRefusal(outcome) && outcome.refused).toEqual({ kind: "choicesNeeded", products: ["Drone"] });
  });

  it("refuses a plan already reserved, or completed", () => {
    const reserved = data([], [plan("p", "X", 1, { reserved: new Map() })]);
    expect(isRefusal(reservePlan(reserved, first(reserved)))).toBe(true);
    const completed = data([["y", 3], ["z", 2]], [plan("p", "X", 1, { completed: "2026-10-02T12:00:00+02:00" })]);
    const outcome = reservePlan(completed, first(completed));
    expect(isRefusal(outcome) && outcome.refused.kind).toBe("planCompleted");
  });

  it("a reserved plan draws only on its pile, never on general stock", () => {
    const d = data([["y", 1000], ["z", 1000]], [plan("5 X", "X", 5, { reserved: new Map([["y", 10], ["z", 10]]) })]);
    const result = calculatePlan(d, d.plans[0]!);
    expect(result.ok && result.builds.find((b) => b.product === "y")?.runs).toBe(5);
  });

  it("another plan taking the material: an unreserved plan then shows what it is short", () => {
    let d = data([["Construction Blocks", 2500], ["Robotics", 120]], [plan("40 Ships", "Ship", 40), plan("80 Ships", "Ship", 80)]);
    const before = calculatePlan(d, d.plans[0]!);
    expect(before.ok && before.acquire).toEqual([]);
    d = ok(reservePlan(d, { index: 1, name: "80 Ships" }));
    const after = calculatePlan(d, d.plans[0]!);
    expect(after.ok && after.acquire).toEqual([{ item: "Construction Blocks", quantity: 500 }]);
  });
});

describe("releaseReservation", () => {
  it("releasing mid-project returns the whole pile, produced components included, and keeps the progress", () => {
    const done: PlanStep = {
      state: "done",
      product: "y",
      runs: 13,
      inputsPerRun: new Map([["a", 2], ["b", 2]]),
      outputPerRun: 1,
      takenFrom: "reserved",
      deducted: new Map([["a", 26], ["b", 26]]),
      started: "2026-10-02T12:00:00+02:00",
      done: "2026-10-03T12:00:00+02:00",
      addedToReserved: 13,
      addedToGeneral: 0,
    };
    const d = data([["z", 2]], [plan("5 X", "X", 5, { reserved: new Map([["y", 15], ["z", 10]]), steps: [done] })]);
    const released = ok(releaseReservation(d, first(d)));
    expect(released.hangar.stock).toEqual(new Map([["z", 12], ["y", 15]]));
    expect(released.plans[0]!.reserved).toBeUndefined();
    expect(released.plans[0]!.steps).toEqual([done]);
  });
});
