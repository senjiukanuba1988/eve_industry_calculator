import { emptyData } from "../data/format";
import { fixtureTexts } from "../data/fixtures/fixture";
import { loadData } from "../data/load";
import { DATA_FILES, type AppData, type Recipe } from "../data/model";
import { serializeFile } from "../data/serialize";
import { isRefusal, type Refusal } from "../refusal";
import { createItem, deleteItem, suggestItems, listItems, renameItem, setItemCategory, type ItemRefusal } from "./items";

function fixture(): AppData {
  const loaded = loadData(fixtureTexts());
  if (!loaded.ok) {
    throw new Error("fixture does not load");
  }
  return loaded.data;
}

function ok(outcome: AppData | Refusal<ItemRefusal>): AppData {
  if (isRefusal(outcome)) {
    throw new Error(`refused: ${JSON.stringify(outcome.refused)}`);
  }
  return outcome;
}

function refused(outcome: AppData | Refusal<ItemRefusal>): ItemRefusal {
  if (!isRefusal(outcome)) {
    throw new Error("expected a refusal");
  }
  return outcome.refused;
}

const recipe = (product: string, inputs: Record<string, number>): Recipe => ({
  product,
  type: "T1 Manufacturing",
  output: 1,
  inputs: new Map(Object.entries(inputs)),
});

function data(parts: Partial<AppData>): AppData {
  return { ...emptyData("1.0.0"), ...parts };
}

describe("creating an item", () => {
  it("adds it to no category, or to the chosen one, trimming the name", () => {
    expect(ok(createItem(fixture(), " Nocxium ")).items.uncategorised).toContain("Nocxium");
    expect(ok(createItem(fixture(), "Nocxium", "Minerals")).items.categories.get("Minerals")).toEqual([
      "Morphite",
      "Pyerite",
      "Tritanium",
      "Nocxium",
    ]);
  });

  it("rejects a name in use, ignoring case, naming the existing item", () => {
    expect(refused(createItem(fixture(), "tritanium"))).toEqual({ kind: "duplicate", existing: "Tritanium" });
  });

  it("rejects an empty name and a category that does not exist", () => {
    expect(refused(createItem(fixture(), " "))).toEqual({ kind: "empty" });
    expect(refused(createItem(fixture(), "Nocxium", "Nope"))).toEqual({ kind: "categoryNotFound", category: "Nope" });
  });
});

describe("renaming an item", () => {
  // The new names sort into the same place as the old ones, so every file must read
  // exactly as before with only the name changed.
  it.each([
    ["Robotics", "Robotics Mk2"],
    ["Construction Blocks", "Construction Blocks Mk2"],
    ["Acolyte II", "Acolyte II Mk2"],
    ["Sulfuric Acid", "Sulfuric Acid Mk2"],
    ["'Arbalest' Cruise Launcher I", "'Arbalest' Cruise Launcher I Mk2"],
  ])("renames %s everywhere it appears, in every file", (from, to) => {
    const before = fixture();
    const after = ok(renameItem(before, from, to));
    for (const file of DATA_FILES) {
      expect(serializeFile(file, after), file).toBe(serializeFile(file, before).replaceAll(JSON.stringify(from), JSON.stringify(to)));
    }
    expect(loadData(Object.fromEntries(DATA_FILES.map((f) => [f, serializeFile(f, after)])) as never).ok).toBe(true);
  });

  it("covers every kind of place a name appears in the fixture", () => {
    const text = (d: AppData) => DATA_FILES.map((f) => serializeFile(f, d)).join("\n");
    const after = ok(renameItem(ok(renameItem(fixture(), "Robotics", "R")), "Acolyte II", "A2"));
    expect(text(after)).not.toMatch(/"Robotics"|"Acolyte II"/);
  });

  it("rejects a name another item has, ignoring case, naming that item; neither changes", () => {
    const before = fixture();
    expect(refused(renameItem(before, "Robotics", " tritanium "))).toEqual({ kind: "duplicate", existing: "Tritanium" });
    expect(listItems(before.items).map((i) => i.name)).toEqual(expect.arrayContaining(["Robotics", "Tritanium"]));
  });

  it("allows changing only the case", () => {
    const after = ok(
      renameItem(
        data({ items: { categories: new Map(), uncategorised: ["tritanium"] }, hangar: { stock: new Map([["tritanium", 5]]) } }),
        "tritanium",
        "Tritanium",
      ),
    );
    expect(after.items.uncategorised).toEqual(["Tritanium"]);
    expect(after.hangar.stock).toEqual(new Map([["Tritanium", 5]]));
  });

  it("rejects an empty name", () => {
    expect(refused(renameItem(fixture(), "Robotics", "  "))).toEqual({ kind: "empty" });
  });

  it("keeps the item in its category", () => {
    expect(ok(renameItem(fixture(), "Robotics", "Robotics Mk2")).items.categories.get("Planetary P3")).toEqual(["Robotics Mk2"]);
  });
});

describe("changing an item's category", () => {
  it("moves an item into another category", () => {
    const after = ok(setItemCategory(fixture(), "Robotics", "Components"));
    expect(after.items.categories.get("Components")).toEqual(["Construction Blocks", "Robotics"]);
    expect(after.items.categories.get("Planetary P3")).toEqual([]);
  });

  it("moves an item to no category, and back into one", () => {
    const out = ok(setItemCategory(fixture(), "Robotics", undefined));
    expect(out.items.uncategorised).toContain("Robotics");
    expect(out.items.categories.get("Planetary P3")).toEqual([]);
    const back = ok(setItemCategory(out, "Robotics", "Structures"));
    expect(back.items.uncategorised).not.toContain("Robotics");
    expect(back.items.categories.get("Structures")).toEqual(["Robotics"]);
  });

  it("refuses a category that does not exist", () => {
    expect(refused(setItemCategory(fixture(), "Robotics", "Nope"))).toEqual({ kind: "categoryNotFound", category: "Nope" });
  });
});

describe("deleting an item", () => {
  it("removes an item nothing uses", () => {
    const before = data({ items: { categories: new Map([["Minerals", ["Tritanium", "Pyerite"]]]), uncategorised: [] } });
    expect(ok(deleteItem(before, "Pyerite")).items.categories.get("Minerals")).toEqual(["Tritanium"]);
  });

  it("refuses while recipes use it, as input or product, naming them", () => {
    const before = data({
      items: { categories: new Map(), uncategorised: ["A", "B", "C"] },
      recipes: [recipe("A", { B: 1 }), recipe("C", { A: 2 })],
    });
    expect(refused(deleteItem(before, "A"))).toEqual({
      kind: "usedByRecipes",
      item: "A",
      recipes: [
        { product: "A", variant: undefined },
        { product: "C", variant: undefined },
      ],
    });
  });

  it("refuses while it holds stock, stating general and reserved stock together", () => {
    const before = data({
      items: { categories: new Map(), uncategorised: ["Tritanium"] },
      hangar: { stock: new Map([["Tritanium", 1000]]) },
      plans: [
        {
          name: "P",
          target: { product: "X" },
          runs: 1,
          created: "2026-10-04T16:32:05+02:00",
          variantChoices: new Map(),
          reserved: new Map([["Tritanium", 200]]),
          steps: [],
        },
      ],
    });
    expect(refused(deleteItem(before, "Tritanium"))).toEqual({ kind: "holdsStock", item: "Tritanium", quantity: 1200 });
  });

  it("is not held back by plans' history: stored steps and variant choices", () => {
    const before = data({
      items: { categories: new Map(), uncategorised: ["Old"] },
      plans: [
        {
          name: "P",
          target: { product: "X" },
          runs: 1,
          created: "2026-10-04T16:32:05+02:00",
          completed: "2026-10-05T10:00:00+02:00",
          variantChoices: new Map([["Old", "Some label"]]),
          steps: [
            {
              state: "done",
              product: "Old",
              runs: 1,
              inputsPerRun: new Map([["Old", 1]]),
              outputPerRun: 1,
              takenFrom: "general",
              done: "2026-10-05T10:00:00+02:00",
              addedToReserved: 0,
              addedToGeneral: 1,
            },
          ],
        },
      ],
    });
    const after = ok(deleteItem(before, "Old"));
    expect(after.items.uncategorised).toEqual([]);
    expect(loadData(Object.fromEntries(DATA_FILES.map((f) => [f, serializeFile(f, after)])) as never).ok).toBe(true);
  });

  it("reports an item that no longer exists", () => {
    expect(refused(deleteItem(data({}), "Nope"))).toEqual({ kind: "notFound", item: "Nope" });
  });
});

describe("suggesting items while typing", () => {
  const names = (text: string, limit?: number) => suggestItems(fixture().items, text, limit).map((i) => i.name);

  it("offers items containing the text, ignoring case, each with its category", () => {
    expect(suggestItems(fixture().items, "robo")).toEqual([{ name: "Robotics", category: "Planetary P3" }]);
    expect(names("TUNGSTEN")).toEqual(["Tungsten Carbide", "Rolled Tungsten Alloy"]);
  });

  it("puts an exact match first, then names starting with the text", () => {
    expect(names("acolyte i")).toEqual(["Acolyte I", "Acolyte II"]);
    expect(names("r")).toEqual([
      "Reactive Metals",
      "Robotics",
      "Rolled Tungsten Alloy",
      "'Arbalest' Cruise Launcher I",
      "Construction Blocks",
      "Consumer Electronics",
      "Flycatcher",
      "Morphite",
      "Pyerite",
      "Sulfuric Acid",
      "Tritanium",
      "Tungsten Carbide",
    ]);
  });

  it("matches names starting with punctuation", () => {
    expect(names("'arb")).toEqual(["'Arbalest' Cruise Launcher I"]);
  });

  it("offers nothing for empty text, and at most the limit", () => {
    expect(names("  ")).toEqual([]);
    expect(names("r", 3)).toHaveLength(3);
  });
});
