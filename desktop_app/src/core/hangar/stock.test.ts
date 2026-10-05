import { emptyData } from "../data/format";
import type { AppData, Plan } from "../data/model";
import { releaseReservation } from "../plans/reservations";
import { isRefusal, type Refusal } from "../refusal";
import { hangarRows, removeStock, setAvailable } from "./stock";

function plan(name: string, reserved?: Record<string, number>): Plan {
  return {
    name,
    target: { product: "Flycatcher" },
    runs: 1,
    created: "2026-10-05T10:00:00+02:00",
    variantChoices: new Map(),
    reserved: reserved && new Map(Object.entries(reserved)),
    steps: [],
  };
}

function data(stock: Record<string, number>, plans: Plan[] = []): AppData {
  return {
    ...emptyData("1.0.0"),
    items: { categories: new Map([["Components", ["Construction Blocks"]]]), uncategorised: ["Flycatcher", "Tritanium", "Old Part"] },
    recipes: [
      {
        product: "Flycatcher",
        type: "T2 Manufacturing",
        output: 1,
        inputs: new Map([
          ["Construction Blocks", 25],
          ["Tritanium", 10],
        ]),
      },
    ],
    hangar: { stock: new Map(Object.entries(stock)) },
    plans,
  };
}

function ok<E>(outcome: AppData | Refusal<E>): AppData {
  if (isRefusal(outcome)) {
    throw new Error(`refused: ${JSON.stringify(outcome.refused)}`);
  }
  return outcome;
}

describe("the hangar's figures", () => {
  it("shows available, reserved and total, naming the plans holding the reservation", () => {
    const rows = hangarRows(data({ "Construction Blocks": 500 }, [plan("80 Flycatchers", { "Construction Blocks": 2000 })]));
    expect(rows).toEqual([
      {
        item: "Construction Blocks",
        category: "Components",
        available: 500,
        reserved: 2000,
        total: 2500,
        reservedBy: [{ plan: "80 Flycatchers", index: 0, quantity: 2000 }],
        usedByRecipes: true,
      },
    ]);
  });

  it("adds up reservations from several plans, and lists items held only as reserved", () => {
    const rows = hangarRows(
      data({ Tritanium: 5 }, [
        plan("B plan", { "Construction Blocks": 30, Tritanium: 1 }),
        plan("A plan", { "Construction Blocks": 70 }),
        plan("Free"),
      ]),
    );
    expect(rows.map((r) => [r.item, r.available, r.reserved, r.total])).toEqual([
      ["Construction Blocks", 0, 100, 100],
      ["Tritanium", 5, 1, 6],
    ]);
    expect(rows[0]!.reservedBy).toEqual([
      { plan: "A plan", index: 1, quantity: 70 },
      { plan: "B plan", index: 0, quantity: 30 },
    ]);
  });

  it("marks stock of an item no recipe uses any more, and keeps it", () => {
    expect(hangarRows(data({ "Old Part": 500 }))).toEqual([
      expect.objectContaining({ item: "Old Part", available: 500, usedByRecipes: false }),
    ]);
  });
});

describe("correcting stock", () => {
  it("sets an available quantity by hand", () => {
    expect(ok(setAvailable(data({ Tritanium: 5 }), "Tritanium", 4750)).hangar.stock).toEqual(new Map([["Tritanium", 4750]]));
  });

  it("adds stock for an item that had none", () => {
    expect(ok(setAvailable(data({}), "Tritanium", 3)).hangar.stock).toEqual(new Map([["Tritanium", 3]]));
  });

  it("removes the item from stock at 0, and with remove, leaving reserved stock with its plan", () => {
    const before = data({ "Construction Blocks": 500, Tritanium: 1 }, [plan("P", { "Construction Blocks": 2000 })]);
    for (const after of [ok(setAvailable(before, "Construction Blocks", 0)), ok(removeStock(before, "Construction Blocks"))]) {
      expect(after.hangar.stock).toEqual(new Map([["Tritanium", 1]]));
      expect(after.plans[0]!.reserved).toEqual(new Map([["Construction Blocks", 2000]]));
    }
  });

  it.each([-1, 1.5, Number.NaN])("refuses %s", (n) => {
    expect(setAvailable(data({}), "Tritanium", n)).toEqual({ refused: { kind: "notWholeNumber" } });
  });

  it("refuses an item that is not in the catalog", () => {
    expect(setAvailable(data({}), "Nope", 1)).toEqual({ refused: { kind: "notAnItem", item: "Nope" } });
  });
});

describe("releasing a reservation", () => {
  it("returns the whole pile to general stock, keeping the plan's steps", () => {
    const before = data({ "Construction Blocks": 500 }, [plan("80 Flycatchers", { "Construction Blocks": 2000, Tritanium: 7 })]);
    const after = ok(releaseReservation(before, { index: 0, name: "80 Flycatchers" }));
    expect(after.hangar.stock).toEqual(
      new Map([
        ["Construction Blocks", 2500],
        ["Tritanium", 7],
      ]),
    );
    expect(after.plans[0]!.reserved).toBeUndefined();
  });

  it("refuses a plan that is not at that place any more, or is not reserved", () => {
    const before = data({}, [plan("A"), plan("B", { Tritanium: 1 })]);
    expect(releaseReservation(before, { index: 1, name: "A" })).toEqual({ refused: { kind: "planNotFound", plan: "A" } });
    expect(releaseReservation(before, { index: 0, name: "A" })).toEqual({ refused: { kind: "notReserved", plan: "A" } });
  });
});
