import { formatDataError } from "./dataError";
import { editFixture, fixtureTexts, lineOf } from "./fixtures/fixture";
import { loadData, type DataFileTexts } from "./load";
import type { DataFileName } from "./model";

function errorsOf(texts: DataFileTexts) {
  const result = loadData(texts);
  if (result.ok) {
    throw new Error("expected the data to be rejected");
  }
  return result.errors.map(({ file, line, message }) => ({ file, line, message }));
}

/** Edits one file of the fixture and expects exactly one error, on the line where `lineAt` appears in the edited text. */
function expectSingleError(file: DataFileName, from: string, to: string, lineAt: string, message: string, after = "") {
  const texts = editFixture(file, from, to);
  expect(errorsOf(texts)).toEqual([{ file, line: lineOf(texts[file]!, lineAt, after), message }]);
}

function expectLoads(texts: DataFileTexts) {
  const result = loadData(texts);
  expect(result.ok ? [] : result.errors.map(formatDataError)).toEqual([]);
}

describe("loadData", () => {
  it("loads the fixture folder", () => {
    expectLoads(fixtureTexts());
  });

  describe("files", () => {
    it("reports a missing file without line, and does not treat it as empty", () => {
      expect(errorsOf({ ...fixtureTexts(), "recipes.json": undefined })).toEqual([
        { file: "recipes.json", line: undefined, message: "the file is missing; put it back, for example from a copy of the data folder" },
      ]);
    });

    it("reports a syntax error with its file and line", () => {
      expectSingleError("hangar.json", '"Sulfuric Acid": 98,', '"Sulfuric Acid": 98', '"Tritanium"', 'expected "," or "}", found """');
    });

    it("reports a repeated key, as a duplicated input line would be", () => {
      expectSingleError(
        "recipes.json",
        '"Morphite": 1,\n        "Robotics": 1\n      }\n    },\n    {\n      "product": "Acolyte II",',
        '"Morphite": 1,\n        "Robotics": 1,\n        "Morphite": 5\n      }\n    },\n    {\n      "product": "Acolyte II",',
        '"Morphite": 5',
        `"Morphite" appears twice in the same object (first on line ${lineOf(fixtureTexts()["recipes.json"]!, '"Morphite": 1')}); each key may appear only once`,
      );
    });

    it("reports a file whose top level is not an object", () => {
      expect(errorsOf({ ...fixtureTexts(), "hangar.json": "[]\n" })).toEqual([
        { file: "hangar.json", line: 1, message: "expected an object, found a list" },
      ]);
    });

    it("reports every broken file, but no cross-file errors while any file is broken", () => {
      const texts = editFixture("hangar.json", '"Tritanium": 1000000', '"Tritanium": 0', editFixture("items.json", '"Tritanium"', '"Tritanium",'));
      expect(errorsOf(texts).map((e) => e.file)).toEqual(["items.json", "hangar.json"]);
    });

    it("collects several errors within one file", () => {
      const texts = editFixture("hangar.json", '"Sulfuric Acid": 98,\n    "Tritanium": 1000000', '"Sulfuric Acid": -1,\n    "Tritanium": "lots"');
      const hangar = texts["hangar.json"]!;
      expect(errorsOf(texts).map((e) => e.line)).toEqual([lineOf(hangar, '"Sulfuric Acid"'), lineOf(hangar, '"Tritanium"')]);
    });
  });

  describe("manifest.json", () => {
    it("requires a whole-number formatVersion of at least 1", () => {
      expectSingleError("manifest.json", '"formatVersion": 1', '"formatVersion": 0', "formatVersion", "formatVersion: expected a whole number of at least 1, found the number 0");
    });

    it("requires writtenBy", () => {
      expectSingleError("manifest.json", '  "writtenBy": "0.1.0",\n', "", "{", 'missing "writtenBy"');
    });

    it("accepts a hand-edited note, which is only for the reader", () => {
      expectLoads(editFixture("manifest.json", '"note": "Data folder', '"note": "My notes. Data folder'));
    });
  });

  describe("structure and field types", () => {
    it("rejects an unknown key, such as a misspelt one", () => {
      expectSingleError(
        "recipes.json",
        '"product": "Flycatcher",\n      "type"',
        '"product": "Flycatcher",\n      "varaint": "x",\n      "type"',
        '"varaint"',
        'unknown key "varaint" in recipes[2]; expected one of: product, type, output, inputs, variant, notes',
      );
    });

    it("rejects a missing required field, at the object's line", () => {
      expectSingleError("recipes.json", '"type": "Reaction",\n      "output": 10000,', '"type": "Reaction",', "{", 'recipes[4]: missing "output"', '"Reactive Metals": 10');
    });

    it("rejects a value of the wrong type", () => {
      expectSingleError("plans.json", '"runs": 80,', '"runs": "80",', '"runs"', 'plans[0].runs: expected a whole number of at least 1, found the text "80"');
    });

    it("rejects an unknown recipe type", () => {
      expectSingleError(
        "recipes.json",
        '"type": "Reaction"',
        '"type": "reaction"',
        '"type": "reaction"',
        'recipes[4].type: expected one of "T1 Manufacturing", "T2 Manufacturing", "Reaction", "Planetary Industry", found the text "reaction"',
      );
    });

    it.each([
      ["zero", "0", "the number 0"],
      ["a negative number", "-5", "the number -5"],
      ["a fraction", "1.5", "the number 1.5"],
      ["an exponent", "1e3", "the number 1e3"],
      ["a number beyond exact range", "9007199254740993", "the number 9007199254740993"],
      ["a quantity in quotes", '"296,949"', 'the text "296,949"'],
    ])("rejects %s as a quantity", (_, value, found) => {
      expectSingleError(
        "hangar.json",
        '"Tritanium": 1000000',
        `"Tritanium": ${value}`,
        '"Tritanium"',
        `stock["Tritanium"]: expected a whole number of at least 1, found ${found}`,
      );
    });

    it("accepts zero for the output split of a done step", () => {
      expectLoads(fixtureTexts()); // the fixture's done step has "addedToGeneral": 0
      expect(fixtureTexts()["plans.json"]).toContain('"addedToGeneral": 0');
    });

    it("rejects an empty name", () => {
      expectSingleError("items.json", '"Pyerite"', '""', '""', 'categories["Minerals"][1]: expected an item name, found empty text');
    });

    it("rejects a name with spaces at either end", () => {
      expectSingleError(
        "items.json",
        '"Pyerite"',
        '"Pyerite "',
        '"Pyerite "',
        'categories["Minerals"][1]: an item name "Pyerite " has spaces at the start or end; remove them',
      );
    });

    it("rejects an empty variant label, which must be left out instead", () => {
      expectSingleError("recipes.json", '"variant": "Symmetry Decryptor",\n      "type"', '"variant": "",\n      "type"', '"variant": ""', "recipes[1].variant: expected a variant label, found empty text");
    });

    it("rejects an empty plan name", () => {
      expectSingleError("plans.json", '"name": "30 Acolyte II"', '"name": " "', '"name": " "', 'plans[1].name: expected a plan name, found empty text');
    });

    it("rejects a time not in the stored form", () => {
      expectSingleError(
        "plans.json",
        '"created": "2026-10-04T16:32:05+02:00"',
        '"created": "04.10.2026 16:32"',
        '"created"',
        'plans[0].created: expected a date and time such as "2026-10-04T16:32:05+02:00", found the text "04.10.2026 16:32"',
      );
    });
  });

  describe("plan steps", () => {
    it("requires a done step to say when it was done", () => {
      expectSingleError(
        "plans.json",
        '          "done": "2026-10-06T21:44:12+02:00",\n',
        "",
        "{",
        'plans[0].steps[0]: a done step needs "done"',
        '"steps"',
      );
    });

    it("rejects a started step carrying a done step's output split", () => {
      expectSingleError(
        "plans.json",
        '"started": "2026-10-06T21:50:00+02:00"',
        '"started": "2026-10-06T21:50:00+02:00",\n          "addedToReserved": 3',
        '"addedToReserved": 3',
        'plans[0].steps[1]: a started step cannot have "addedToReserved"',
      );
    });

    it("rejects an unknown step state", () => {
      expectSingleError("plans.json", '"state": "started"', '"state": "running"', '"state": "running"', 'plans[0].steps[1].state: expected one of "started", "done", found the text "running"');
    });

    it("rejects a reservation on a completed plan", () => {
      expectSingleError(
        "plans.json",
        '"completed": "2026-10-03T18:20:00+02:00",',
        '"completed": "2026-10-03T18:20:00+02:00",\n      "reserved": {},',
        '"reserved": {}',
        'plans[1].reserved: a completed plan cannot hold a reservation; remove "reserved" or "completed"',
      );
    });
  });

  describe("names in items.json", () => {
    it("rejects two categories differing only in case", () => {
      expectSingleError("items.json", '"Structures": []', '"ships": []', '"ships"', 'category "ships" is the same name as "Ships"; category names must differ by more than case');
    });

    it("rejects an item listed twice in one category", () => {
      const texts = editFixture("items.json", '"Pyerite",', '"Pyerite",\n      "Pyerite",');
      expect(errorsOf(texts)).toEqual([
        {
          file: "items.json",
          line: lineOf(texts["items.json"]!, '"Pyerite"') + 1,
          message: '"Pyerite" is listed more than once; every item must appear exactly once, in one category or in uncategorised',
        },
      ]);
    });

    it("rejects an item in two places differing only in case", () => {
      const texts = editFixture("items.json", '"Acolyte II"\n', '"Acolyte II",\n    "tritanium"\n');
      expect(errorsOf(texts)).toEqual([
        {
          file: "items.json",
          line: lineOf(texts["items.json"]!, '"tritanium"'),
          message: '"tritanium" is the same name as "Tritanium"; every item must appear exactly once, in one category or in uncategorised',
        },
      ]);
    });
  });

  describe("references", () => {
    it("rejects a recipe input that is not an item", () => {
      expectSingleError("recipes.json", '"Sulfuric Acid": 98', '"Sulfuric Acd": 98', '"Sulfuric Acd"', 'input "Sulfuric Acd" is not an item in items.json');
    });

    it("rejects a recipe product that is not an item", () => {
      expectSingleError("recipes.json", '"product": "Robotics"', '"product": "Robotix"', '"product": "Robotix"', 'product "Robotix" is not an item in items.json');
    });

    it("handles names starting with punctuation, as real item names do", () => {
      expect(fixtureTexts()["hangar.json"]).toContain(`"'Arbalest' Cruise Launcher I": 12`);
      expectSingleError(
        "hangar.json",
        `"'Arbalest' Cruise Launcher I"`,
        `"Arbalest' Cruise Launcher I"`,
        `"Arbalest'`,
        `"Arbalest' Cruise Launcher I" is not an item in items.json`,
      );
    });

    it("matches names exactly, including case", () => {
      expectSingleError("recipes.json", '"Sulfuric Acid": 98', '"sulfuric acid": 98', '"sulfuric acid"', 'input "sulfuric acid" is not an item in items.json');
    });

    it("rejects hangar stock of something that is not an item", () => {
      expectSingleError("hangar.json", '"Tritanium"', '"Tritanum"', '"Tritanum"', '"Tritanum" is not an item in items.json');
    });

    it("rejects a reserved item that is not an item", () => {
      expectSingleError("plans.json", '"Robotics": 4', '"Robotix": 4', '"Robotix"', 'reserved item "Robotix" is not an item in items.json');
    });

    it("catches a rename done by hand in only one file", () => {
      const texts = editFixture("items.json", '"Morphite"', '"Morphite (renamed)"');
      expect(errorsOf(texts)).toEqual([
        { file: "recipes.json", line: lineOf(texts["recipes.json"]!, '"Morphite"'), message: 'input "Morphite" is not an item in items.json' },
        { file: "recipes.json", line: lineOf(texts["recipes.json"]!, '"Morphite"', '"Symmetry Decryptor"'), message: 'input "Morphite" is not an item in items.json' },
      ]);
    });
  });

  describe("recipe rules", () => {
    it("rejects a recipe with no inputs", () => {
      expectSingleError(
        "recipes.json",
        `{\n        "Rolled Tungsten Alloy": 98,\n        "Sulfuric Acid": 98\n      }`,
        "{}",
        '"inputs": {}',
        'the recipe for "Tungsten Carbide" has no inputs; a recipe needs at least one',
      );
    });

    it("rejects a recipe consuming its own product", () => {
      expectSingleError("recipes.json", '"Reactive Metals": 10', '"Robotics": 10', '"Robotics": 10', 'the recipe for "Robotics" consumes its own product; a recipe cannot do that');
    });

    it("rejects a second recipe for a product that is not T2 Manufacturing", () => {
      const texts = editFixture(
        "recipes.json",
        '"product": "Tungsten Carbide"',
        '"product": "Robotics"',
      );
      // Two Robotics recipes, of different types: the type rule fires on the second.
      expect(errorsOf(texts)).toEqual([
        {
          file: "recipes.json",
          line: lineOf(texts["recipes.json"]!, '"type": "Reaction"'),
          message: '"Robotics" has recipes of different types (Planetary Industry and Reaction); all recipes for one product must be of the same type',
        },
      ]);
    });

    it("rejects two recipes of the same non-T2 type for one product", () => {
      const texts = editFixture("recipes.json", '"product": "Tungsten Carbide",\n      "type": "Reaction"', '"product": "Robotics",\n      "type": "Planetary Industry"');
      expect(errorsOf(texts)).toEqual([
        {
          file: "recipes.json",
          // the opening brace of the second Robotics recipe
          line: lineOf(texts["recipes.json"]!, "{", '"Reactive Metals": 10'),
          message: '"Robotics" has 2 recipes of type Planetary Industry; only T2 Manufacturing products may have more than one recipe',
        },
      ]);
    });

    it("rejects mixing recipe types for one product", () => {
      expectSingleError(
        "recipes.json",
        `"variant": "Symmetry Decryptor",\n      "type": "T2 Manufacturing"`,
        `"variant": "Symmetry Decryptor",\n      "type": "T1 Manufacturing"`,
        '"type": "T1 Manufacturing"',
        '"Acolyte II" has recipes of different types (T2 Manufacturing and T1 Manufacturing); all recipes for one product must be of the same type',
      );
    });

    it("requires a variant label on each of several T2 recipes", () => {
      expectSingleError(
        "recipes.json",
        `      "variant": "Accelerant Decryptor",\n`,
        "",
        "{",
        '"Acolyte II" has 2 recipes, and this one has no variant label; each needs its own',
        '"recipes"',
      );
    });

    it("requires distinct variant labels, ignoring case", () => {
      expectSingleError(
        "recipes.json",
        '"variant": "Symmetry Decryptor"',
        '"variant": "accelerant decryptor"',
        '"variant": "accelerant decryptor"',
        '"Acolyte II" has two recipes labelled "accelerant decryptor"; each variant needs its own distinct label',
      );
    });

    it("allows a variant label on a product's only recipe", () => {
      // Robotics, not Flycatcher: a plan targets Flycatcher without a label, and would then no longer match.
      expectLoads(editFixture("recipes.json", '"product": "Robotics",\n', '"product": "Robotics",\n      "variant": "Standard",\n'));
    });

    it("rejects a two-step cycle", () => {
      // Tungsten Carbide is made from Sulfuric Acid; make Sulfuric Acid from Tungsten Carbide.
      const texts = withRecipe("Sulfuric Acid", "Reaction", { "Tungsten Carbide": 1 });
      expect(errorsOf(texts)).toEqual([
        {
          file: "recipes.json",
          line: lineOf(texts["recipes.json"]!, '"Tungsten Carbide": 1', '"product": "Sulfuric Acid"'),
          message: 'circular chain: Tungsten Carbide → Sulfuric Acid → Tungsten Carbide; no product may end up needed to make itself',
        },
      ]);
    });

    it("rejects a three-step cycle, showing the whole chain", () => {
      // Flycatcher ← Robotics ← Reactive Metals; make Reactive Metals from Flycatcher.
      const texts = withRecipe("Reactive Metals", "Planetary Industry", { Flycatcher: 1 });
      expect(errorsOf(texts).map((e) => e.message)).toEqual([
        'circular chain: Robotics → Reactive Metals → Flycatcher → Robotics; no product may end up needed to make itself',
      ]);
    });

    it("rejects a cycle running through one T2 variant only", () => {
      // Only the Symmetry variant of Acolyte II uses Morphite 2; make Morphite from Acolyte II.
      const texts = withRecipe("Morphite", "T1 Manufacturing", { "Acolyte II": 1 });
      expect(errorsOf(texts).map((e) => e.message)).toEqual([
        'circular chain: Acolyte II → Morphite → Acolyte II; no product may end up needed to make itself',
      ]);
    });
  });

  describe("plan targets", () => {
    it("rejects an incomplete plan whose target has no recipe", () => {
      expectSingleError(
        "plans.json",
        '"target": {\n        "product": "Flycatcher"\n      }',
        '"target": {\n        "product": "Tritanium"\n      }',
        '"target"',
        'plan "80 Flycatchers" targets "Tritanium", which has no recipe in recipes.json',
      );
    });

    it("rejects an incomplete plan whose target variant does not exist", () => {
      expectSingleError(
        "plans.json",
        '"product": "Flycatcher"\n      }',
        '"product": "Acolyte II",\n        "variant": "Parity Decryptor"\n      }',
        '"target"',
        'plan "80 Flycatchers" targets "Acolyte II" with variant "Parity Decryptor", but recipes.json has "Acolyte II" only with: "Accelerant Decryptor", "Symmetry Decryptor"',
      );
    });

    it("rejects an incomplete plan whose target item does not exist", () => {
      expectSingleError("plans.json", '"product": "Flycatcher"\n', '"product": "Flycatcher II"\n', '"product": "Flycatcher II"', 'target "Flycatcher II" is not an item in items.json');
    });

    it("accepts a completed plan whose target recipe and item are gone", () => {
      expectLoads(editFixture("plans.json", '"product": "Acolyte II",\n        "variant": "Symmetry Decryptor"', '"product": "Deleted Drone"'));
    });
  });

  describe("not malformed", () => {
    it("accepts a variant choice naming a recipe that no longer exists", () => {
      expectLoads(editFixture("plans.json", '"Acolyte II": "Accelerant Decryptor"', '"Gone Product": "Gone Variant"'));
    });

    it("accepts stored steps naming items that no longer exist", () => {
      expectLoads(editFixture("plans.json", '"product": "Robotics",\n          "runs": 6', '"product": "Deleted Item",\n          "runs": 6'));
    });

    it("accepts hangar stock of an item no recipe uses", () => {
      expect(fixtureTexts()["recipes.json"]).not.toContain("Tritanium");
      expectLoads(fixtureTexts()); // the fixture holds Tritanium stock
    });

    it("accepts a reserved pile that has been emptied", () => {
      expectLoads(editFixture("plans.json", '"reserved": {\n        "Construction Blocks": 2000,\n        "Robotics": 4\n      }', '"reserved": {}'));
    });
  });
});

/** The fixture with one more recipe added at the end of recipes.json. */
function withRecipe(product: string, type: string, inputs: Record<string, number>): DataFileTexts {
  const inputLines = Object.entries(inputs)
    .map(([name, qty]) => `        ${JSON.stringify(name)}: ${qty}`)
    .join(",\n");
  const recipe = `,\n    {\n      "product": ${JSON.stringify(product)},\n      "type": ${JSON.stringify(type)},\n      "output": 1,\n      "inputs": {\n${inputLines}\n      }\n    }\n  ]\n}\n`;
  return editFixture("recipes.json", "\n  ]\n}\n", recipe);
}
