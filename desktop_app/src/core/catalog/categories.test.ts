import { emptyData } from "../data/format";
import type { AppData } from "../data/model";
import { isRefusal, type Refusal } from "../refusal";
import { createCategory, deleteCategory, moveItemsOutOfCategory, renameCategory, type CategoryRefusal } from "./categories";

function data(categories: Record<string, string[]> = {}, uncategorised: string[] = []): AppData {
  return { ...emptyData("1.0.0"), items: { categories: new Map(Object.entries(categories)), uncategorised } };
}

function ok(outcome: AppData | Refusal<CategoryRefusal>): AppData {
  if (isRefusal(outcome)) {
    throw new Error(`refused: ${JSON.stringify(outcome.refused)}`);
  }
  return outcome;
}

function refused(outcome: AppData | Refusal<CategoryRefusal>): CategoryRefusal {
  if (!isRefusal(outcome)) {
    throw new Error("expected a refusal");
  }
  return outcome.refused;
}

const categories = (d: AppData) => Object.fromEntries(d.items.categories);

describe("creating a category", () => {
  it("adds an empty category, available at once", () => {
    expect(categories(ok(createCategory(data(), "Minerals")))).toEqual({ Minerals: [] });
  });

  it("trims surrounding spaces from the name", () => {
    expect(categories(ok(createCategory(data(), "  Minerals "))).Minerals).toEqual([]);
  });

  it("rejects a duplicate, ignoring case and surrounding spaces, naming the existing one", () => {
    const before = data({ Minerals: ["Tritanium"] });
    expect(refused(createCategory(before, " minerals "))).toEqual({ kind: "duplicate", existing: "Minerals" });
  });

  it("rejects an empty name", () => {
    expect(refused(createCategory(data(), "   "))).toEqual({ kind: "empty" });
  });

  it("leaves the data it was given untouched", () => {
    const before = data({ Minerals: ["Tritanium"] });
    createCategory(before, "Ships");
    expect(categories(before)).toEqual({ Minerals: ["Tritanium"] });
  });
});

describe("renaming a category", () => {
  it("keeps its items", () => {
    const after = ok(renameCategory(data({ Minerals: ["Tritanium", "Pyerite"] }), "Minerals", "Ore Minerals"));
    expect(categories(after)).toEqual({ "Ore Minerals": ["Tritanium", "Pyerite"] });
  });

  it("allows changing only the case", () => {
    expect(categories(ok(renameCategory(data({ minerals: [] }), "minerals", "Minerals")))).toEqual({ Minerals: [] });
  });

  it("rejects a name another category has", () => {
    expect(refused(renameCategory(data({ Minerals: [], Ships: [] }), "Ships", "MINERALS"))).toEqual({
      kind: "duplicate",
      existing: "Minerals",
    });
  });

  it("rejects an empty name", () => {
    expect(refused(renameCategory(data({ Minerals: [] }), "Minerals", ""))).toEqual({ kind: "empty" });
  });

  it("changes nothing when the name is the same", () => {
    const before = data({ Minerals: [] });
    expect(renameCategory(before, "Minerals", " Minerals ")).toBe(before);
  });
});

describe("deleting a category", () => {
  it("removes an empty category", () => {
    expect(categories(ok(deleteCategory(data({ Minerals: [], Ships: [] }), "Ships")))).toEqual({ Minerals: [] });
  });

  it("refuses a category in use, stating how many items use it", () => {
    expect(refused(deleteCategory(data({ Minerals: ["Tritanium", "Pyerite"] }), "Minerals"))).toEqual({
      kind: "inUse",
      category: "Minerals",
      count: 2,
    });
  });

  it("works once its items have been moved out", () => {
    const moved = ok(moveItemsOutOfCategory(data({ Minerals: ["Tritanium", "Pyerite"] }, ["Robotics"]), "Minerals"));
    expect(categories(moved)).toEqual({ Minerals: [] });
    expect(moved.items.uncategorised).toEqual(["Robotics", "Tritanium", "Pyerite"]);
    expect(categories(ok(deleteCategory(moved, "Minerals")))).toEqual({});
  });

  it("reports a category that no longer exists", () => {
    expect(refused(deleteCategory(data(), "Minerals"))).toEqual({ kind: "notFound", category: "Minerals" });
  });
});
