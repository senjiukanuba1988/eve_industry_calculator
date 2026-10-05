import { emptyData } from "../data/format";
import type { AppData } from "../data/model";
import { pasteStock, readPasteLines } from "./paste";

const NBSP = String.fromCharCode(0xa0);
const NNBSP = String.fromCharCode(0x202f);

function data(stock: Record<string, number> = {}): AppData {
  return {
    ...emptyData("1.0.0"),
    items: {
      categories: new Map([["Minerals", ["Zydrine", "Tritanium"]]]),
      uncategorised: ["Sulfuric Acid", "F77 Compact Co-Processor", "Robotics", "Unused Item", "'Arbalest' Cruise Launcher I"],
    },
    recipes: [
      { product: "Robotics", type: "Planetary Industry", output: 1, inputs: new Map([["Zydrine", 1]]) },
      {
        product: "'Arbalest' Cruise Launcher I",
        type: "T1 Manufacturing",
        output: 1,
        inputs: new Map([
          ["Tritanium", 1],
          ["Sulfuric Acid", 1],
          ["F77 Compact Co-Processor", 1],
        ]),
      },
    ],
    hangar: { stock: new Map(Object.entries(stock)) },
  };
}

const stockOf = (d: AppData) => Object.fromEntries(d.hangar.stock);

describe("reading pasted lines", () => {
  it("reads the inventory window format: name, tab, quantity", () => {
    expect(readPasteLines("Zydrine\t296,949").lines).toEqual([{ name: "Zydrine", quantity: 296949 }]);
  });

  it("ignores the assets window's trailing columns", () => {
    expect(readPasteLines("Sulfuric Acid\t98\tMineral\t9.80 m3\t1,234,567.89 ISK").lines).toEqual([
      { name: "Sulfuric Acid", quantity: 98 },
    ]);
  });

  it("keeps digits inside a name as part of the name", () => {
    expect(readPasteLines("F77 Compact Co-Processor\t3").lines).toEqual([{ name: "F77 Compact Co-Processor", quantity: 3 }]);
  });

  it("reads a typed line with spaces only", () => {
    expect(readPasteLines("Tritanium 500").lines).toEqual([{ name: "Tritanium", quantity: 500 }]);
  });

  it.each([
    ["commas", "1,234,567"],
    ["dots", "1.234.567"],
    ["no-break spaces", `1${NBSP}234${NBSP}567`],
    ["narrow no-break spaces", `1${NNBSP}234${NNBSP}567`],
  ])("reads thousands separated by %s", (_, number) => {
    expect(readPasteLines(`Tritanium\t${number}`).lines).toEqual([{ name: "Tritanium", quantity: 1234567 }]);
  });

  it("reads names starting with punctuation", () => {
    expect(readPasteLines("'Arbalest' Cruise Launcher I\t12\tCruise Missile Launcher").lines).toEqual([
      { name: "'Arbalest' Cruise Launcher I", quantity: 12 },
    ]);
  });

  it("skips lines without a quantity, and ignores blank lines; Windows line endings are fine", () => {
    expect(readPasteLines("Zydrine\t5\r\n\r\nRifter\tFrigate\r\n  \r\n0 Tritanium")).toEqual({
      lines: [{ name: "Zydrine", quantity: 5 }],
      skipped: ["Rifter\tFrigate", "0 Tritanium"],
    });
  });

  it("skips a zero quantity", () => {
    expect(readPasteLines("Tritanium\t0").skipped).toEqual(["Tritanium\t0"]);
  });
});

describe("pasting into the hangar", () => {
  it("adds to existing stock, never replacing it", () => {
    const { data: after, summary } = pasteStock(data({ Zydrine: 4, Tritanium: 7 }), "Zydrine\t296,949");
    expect(stockOf(after)).toEqual({ Zydrine: 296953, Tritanium: 7 });
    expect(summary.added).toEqual([{ item: "Zydrine", quantity: 296949 }]);
  });

  it("doubles the stock when the same text is pasted twice", () => {
    const text = "Zydrine\t10\nSulfuric Acid\t98";
    const once = pasteStock(data(), text).data;
    expect(stockOf(pasteStock(once, text).data)).toEqual({ Zydrine: 20, "Sulfuric Acid": 196 });
  });

  it("keeps only items some recipe uses as input or product, reporting the rest as ignored with the reason", () => {
    const { data: after, summary } = pasteStock(
      data(),
      ["Robotics\t2", "Tritanium\t100", "Unused Item\t5", "Large Shield Extender II\t3", "Rifter\t1\tFrigate"].join("\n"),
    );
    expect(stockOf(after)).toEqual({ Robotics: 2, Tritanium: 100 });
    expect(summary.ignored).toEqual([
      { name: "Large Shield Extender II", quantity: 3, reason: "notAnItem" },
      { name: "Rifter", quantity: 1, reason: "notAnItem" },
      { name: "Unused Item", quantity: 5, reason: "notUsedByRecipe" },
    ]);
  });

  it("matches item names ignoring case, storing them as the catalog spells them", () => {
    expect(stockOf(pasteStock(data(), "tritanium\t5").data)).toEqual({ Tritanium: 5 });
  });

  it("sums an item named on several lines, as from several stations", () => {
    const { summary } = pasteStock(data(), "Tritanium\t5\nTritanium\t7\nNope\t1\nnope\t2");
    expect(summary.added).toEqual([{ item: "Tritanium", quantity: 12 }]);
    expect(summary.ignored).toEqual([{ name: "Nope", quantity: 3, reason: "notAnItem" }]);
  });

  it("lists skipped lines in the summary", () => {
    expect(pasteStock(data(), "Tritanium\t5\nNo quantity here").summary.skipped).toEqual(["No quantity here"]);
  });

  it("changes nothing, and returns the same data, when nothing can be stored", () => {
    const before = data({ Zydrine: 1 });
    expect(pasteStock(before, "Unused Item\t5").data).toBe(before);
  });
});
