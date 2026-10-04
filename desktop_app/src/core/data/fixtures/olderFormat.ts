// Test helpers: a made-up older format, for exercising conversion before a real one exists.

import { DATA_FILES } from "../model";
import type { ConversionStep, RawDataFiles } from "../format";
import { fixtureTexts } from "./fixture";

/** The current fixture's data files, parsed, as a conversion step would receive them. */
export function fixtureRaw(): RawDataFiles {
  const texts = fixtureTexts();
  return new Map(DATA_FILES.filter((f) => f !== "manifest.json").map((f) => [f, JSON.parse(texts[f]!) as unknown]));
}

/**
 * A made-up older format, 1 in these tests with the current one called 2: hangar stock was
 * kept in "stock.json" as { "items": {...} }. The step moves it to hangar.json.
 */
export const MOVE_STOCK: ConversionStep = {
  from: 1,
  describe: "Hangar stock moves from stock.json to hangar.json",
  convert(files) {
    const old = files.get("stock.json") as { items?: unknown } | undefined;
    if (!old || typeof old.items !== "object") {
      throw new Error("stock.json → items: expected an object of item quantities");
    }
    files.delete("stock.json");
    files.set("hangar.json", { stock: old.items });
    return files;
  },
};

export function olderFormatRaw(): RawDataFiles {
  const files = fixtureRaw();
  const hangar = files.get("hangar.json") as { stock: unknown };
  files.delete("hangar.json");
  files.set("stock.json", { items: hangar.stock });
  return files;
}
