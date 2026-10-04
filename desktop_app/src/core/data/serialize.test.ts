import { fixtureTexts } from "./fixtures/fixture";
import { loadData } from "./load";
import { DATA_FILES, type AppData, type Plan, type Recipe } from "./model";
import { serializeFile, serializeHangar, serializeItems, serializePlans, serializeRecipes } from "./serialize";

function loadFixture(texts = fixtureTexts()): AppData {
  const result = loadData(texts);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.errors, null, 2));
  }
  return result.data;
}

describe("round trip", () => {
  it.each(DATA_FILES)("loading and saving %s reproduces it byte for byte", (file) => {
    expect(serializeFile(file, loadFixture())).toBe(fixtureTexts()[file]);
  });

  it("accepts CRLF line endings and a byte order mark, and writes LF without one", () => {
    const original = fixtureTexts();
    const edited = Object.fromEntries(
      DATA_FILES.map((f) => [f, "\uFEFF" + original[f]!.replace(/\n/g, "\r\n")]),
    ) as typeof original;
    const data = loadFixture(edited);
    for (const file of DATA_FILES) {
      expect(serializeFile(file, data)).toBe(original[file]);
    }
  });

  it("writes hand-edited layout back in the canonical layout", () => {
    const compact = `{"stock":{"Tritanium":1000000,"Sulfuric Acid":98,"'Arbalest' Cruise Launcher I":12,"Construction Blocks":500}}`;
    const data = loadFixture({ ...fixtureTexts(), "hangar.json": compact });
    expect(serializeHangar(data.hangar)).toBe(fixtureTexts()["hangar.json"]);
  });
});

describe("canonical layout", () => {
  it("sorts categories, items and maps by name ignoring case", () => {
    const text = serializeItems({
      categories: new Map([
        ["ships", ["b", "A", "C"]],
        ["Minerals", []],
      ]),
      uncategorised: ["zeta", "Alpha"],
    });
    expect(text).toBe(
      '{\n  "categories": {\n    "Minerals": [],\n    "ships": [\n      "A",\n      "b",\n      "C"\n    ]\n  },\n  "uncategorised": [\n    "Alpha",\n    "zeta"\n  ]\n}\n',
    );
  });

  it("keeps item names that look like numbers in name order", () => {
    expect(serializeHangar({ stock: new Map([["b", 1], ["10", 2], ["9", 3]]) })).toBe(
      '{\n  "stock": {\n    "10": 2,\n    "9": 3,\n    "b": 1\n  }\n}\n',
    );
  });

  it("sorts recipes by product, then variant, with an unlabelled recipe first", () => {
    const recipe = (product: string, variant?: string): Recipe => ({
      product,
      variant,
      type: "T2 Manufacturing",
      output: 1,
      inputs: new Map([["X", 1]]),
    });
    const text = serializeRecipes([recipe("b", "Z"), recipe("a"), recipe("b", "y"), recipe("B")]);
    const order = [...text.matchAll(/"product": "(\w)",(?:\n\s+"variant": "(\w)")?/g)].map((m) => m[1]! + (m[2] ?? ""));
    expect(order).toEqual(["a", "B", "by", "bZ"]);
  });

  it("omits optional fields rather than writing them empty", () => {
    const plan: Plan = {
      name: "p",
      target: { product: "X" },
      runs: 1,
      created: "2026-10-04T16:32:05+02:00",
      variantChoices: new Map(),
      steps: [],
    };
    expect(serializePlans([plan])).toBe(
      '{\n  "plans": [\n    {\n      "name": "p",\n      "target": {\n        "product": "X"\n      },\n      "runs": 1,\n      "created": "2026-10-04T16:32:05+02:00",\n      "steps": []\n    }\n  ]\n}\n',
    );
  });

  it("writes a reserved pile that has been emptied, since that still means reserved", () => {
    const plan: Plan = {
      name: "p",
      target: { product: "X" },
      runs: 1,
      created: "2026-10-04T16:32:05+02:00",
      variantChoices: new Map(),
      reserved: new Map(),
      steps: [],
    };
    expect(serializePlans([plan])).toContain('"reserved": {},');
  });

  it("keeps plans in their stored order", () => {
    const plan = (name: string): Plan => ({
      name,
      target: { product: "X" },
      runs: 1,
      created: "2026-10-04T16:32:05+02:00",
      variantChoices: new Map(),
      steps: [],
    });
    const text = serializePlans([plan("b"), plan("a")]);
    expect(text.indexOf('"b"')).toBeLessThan(text.indexOf('"a"'));
  });
});
