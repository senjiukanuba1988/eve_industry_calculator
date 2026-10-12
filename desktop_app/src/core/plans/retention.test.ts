import { emptyData } from "../data/format";
import type { AppData, Plan } from "../data/model";
import { removeExpiredPlans } from "./retention";

const COMPLETED = "2026-10-01T12:00:00+02:00";
const at = (text: string) => new Date(text);

function data(): AppData {
  const plan = (name: string, completed?: string): Plan => ({
    name,
    target: { product: "X" },
    runs: 1,
    created: "2026-09-01T12:00:00+02:00",
    completed,
    variantChoices: new Map(),
    steps: [],
  });
  return { ...emptyData("1.0.0"), hangar: { stock: new Map([["a", 5]]) }, plans: [plan("open"), plan("done", COMPLETED)] };
}

describe("removeExpiredPlans", () => {
  it("keeps a plan completed 6 days 23 hours ago", () => {
    const d = data();
    expect(removeExpiredPlans(d, at("2026-10-08T11:00:00+02:00"))).toBe(d);
  });

  it("removes a plan completed 7 days 1 hour ago, leaving open plans and the hangar alone", () => {
    const d = removeExpiredPlans(data(), at("2026-10-08T13:00:00+02:00"));
    expect(d.plans.map((p) => p.name)).toEqual(["open"]);
    expect(d.hangar).toEqual(data().hangar);
  });

  it("counts the time between instants, whatever the offsets", () => {
    // 11:30 UTC is 13:30 at +02:00: 7 days 1.5 hours after completion.
    expect(removeExpiredPlans(data(), at("2026-10-08T11:30:00Z")).plans).toHaveLength(1);
  });
});
