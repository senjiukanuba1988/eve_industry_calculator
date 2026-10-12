import { emptyData } from "../data/format";
import type { AppData, Plan, PlanStep } from "../data/model";
import { calculatePlan } from "../plans/plans";
import { reservePlan } from "../plans/reservations";
import { isRefusal } from "../refusal";
import { resetEffect, resetHangar } from "./reset";

const step = (state: "started" | "done"): PlanStep => ({
  state,
  product: "y",
  runs: 13,
  inputsPerRun: new Map([["a", 2], ["b", 2]]),
  outputPerRun: 1,
  takenFrom: "general",
  deducted: new Map([["a", 26], ["b", 26]]),
  started: "2026-10-02T12:00:00+02:00",
  ...(state === "done" ? { done: "2026-10-03T12:00:00+02:00", addedToReserved: 0, addedToGeneral: 13 } : {}),
});

function plan(name: string, fields: Partial<Plan> = {}): Plan {
  return { name, target: { product: "X" }, runs: 5, created: "2026-10-01T12:00:00+02:00", variantChoices: new Map([["y", "v"]]), steps: [], ...fields };
}

function data(): AppData {
  return {
    ...emptyData("1.0.0"),
    recipes: [
      { product: "X", type: "T1 Manufacturing", output: 1, inputs: new Map([["y", 3], ["z", 2]]) },
      { product: "y", type: "T1 Manufacturing", output: 1, inputs: new Map([["a", 2], ["b", 2]]) },
    ],
    hangar: { stock: new Map([["a", 5], ["Tritanium", 100]]) },
    plans: [
      plan("Reserved", { reserved: new Map([["z", 10]]), steps: [step("done"), step("started")] }),
      plan("Fresh"),
      plan("Other", { steps: [step("started")] }),
      plan("Finished", { completed: "2026-10-04T12:00:00+02:00", steps: [step("done")] }),
    ],
  };
}

describe("resetHangar", () => {
  it("resyncing with the game: no stock, no reservations, every step back to not started, every plan kept", () => {
    const after = resetHangar(data());
    expect(after.hangar.stock.size).toBe(0);
    expect(after.plans.map((p) => p.name)).toEqual(["Reserved", "Fresh", "Other", "Finished"]);
    for (const p of after.plans.slice(0, 3)) {
      expect(p.reserved).toBeUndefined();
      expect(p.steps).toEqual([]);
      expect(p.target).toEqual({ product: "X" });
      expect(p.runs).toBe(5);
      expect(p.variantChoices).toEqual(new Map([["y", "v"]]));
    }
  });

  it("leaves completed plans exactly as they are", () => {
    const before = data();
    expect(resetHangar(before).plans[3]).toBe(before.plans[3]);
  });

  it("picking a plan back up after a reset: pasted components replace the steps that made them", () => {
    let d = resetHangar(data());
    d = { ...d, hangar: { stock: new Map([["y", 15], ["z", 10]]) } };
    const result = calculatePlan(d, d.plans[0]!);
    expect(result.ok && result.builds.map((b) => b.product)).toEqual(["X"]);
    expect(result.ok && result.acquire).toEqual([]);
    // ...and, covered again, it can be reserved.
    const reserved = reservePlan(d, { index: 0, name: d.plans[0]!.name });
    expect(isRefusal(reserved) ? reserved.refused : reserved.plans[0]!.reserved).toEqual(new Map([["y", 15], ["z", 10]]));
  });
});

describe("resetEffect", () => {
  it("states what will be lost, leaving completed plans out", () => {
    expect(resetEffect(data())).toEqual({
      stockItems: 2,
      reservedPlans: ["Reserved"],
      plansWithProgress: [
        { plan: "Reserved", started: 1, done: 1 },
        { plan: "Other", started: 1, done: 0 },
      ],
    });
  });
});
