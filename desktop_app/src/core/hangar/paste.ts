// Reading text pasted from the game's inventory or assets window (hangar spec, "Adding
// stock by pasting"): on each line, the first token made only of digits and separators is
// the quantity, the text before it is the item name, and the rest is ignored. Only items
// some recipe uses, as input or product, are kept; pasting adds to existing stock.

import type { AppData, Quantities } from "../data/model";
import { compareNames, nameKey } from "../data/names";

/** Thousands separators the game may use besides "," and ".": no-break space and narrow no-break space. */
const SPACES_IN_NUMBERS = String.fromCharCode(0xa0, 0x202f);
const QUANTITY = new RegExp(`^[0-9][0-9.,${SPACES_IN_NUMBERS}]*$`);
const DIGITS = new RegExp(`[.,${SPACES_IN_NUMBERS}]`, "g");

export interface PasteLine {
  name: string;
  quantity: number;
}

export type IgnoredReason = "notAnItem" | "notUsedByRecipe";

export interface PasteSummary {
  /** Per item, summed over every line naming it; sorted by name. */
  added: Array<{ item: string; quantity: number }>;
  /** Lines read but not stored, with the reason. Same name on several lines is summed. */
  ignored: Array<{ name: string; quantity: number; reason: IgnoredReason }>;
  /** Lines with no quantity on them, as they were pasted. */
  skipped: string[];
}

/** Splits pasted text into name and quantity per line; lines without a quantity are returned as skipped. */
export function readPasteLines(text: string): { lines: PasteLine[]; skipped: string[] } {
  const lines: PasteLine[] = [];
  const skipped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === "") {
      continue;
    }
    // Tabs and plain spaces separate tokens; no-break spaces may sit inside a number.
    const tokens = [...raw.matchAll(/[^ \t]+/g)];
    const quantityToken = tokens.find((t) => QUANTITY.test(t[0]));
    const name = quantityToken ? raw.slice(0, quantityToken.index).trim() : "";
    const quantity = quantityToken ? Number(quantityToken[0].replace(DIGITS, "")) : Number.NaN;
    if (name === "" || !Number.isSafeInteger(quantity) || quantity < 1) {
      skipped.push(raw.trim());
    } else {
      lines.push({ name, quantity });
    }
  }
  return { lines, skipped };
}

/** Adds the stock found in pasted text to general stock; never replaces or clears anything. */
export function pasteStock(data: AppData, text: string): { data: AppData; summary: PasteSummary } {
  const catalog = new Map<string, string>();
  for (const name of [...[...data.items.categories.values()].flat(), ...data.items.uncategorised]) {
    catalog.set(nameKey(name), name);
  }
  const used = new Set<string>();
  for (const r of data.recipes) {
    used.add(r.product);
    for (const input of r.inputs.keys()) {
      used.add(input);
    }
  }

  const { lines, skipped } = readPasteLines(text);
  const added: Quantities = new Map();
  const ignored = new Map<string, { name: string; quantity: number; reason: IgnoredReason }>();
  for (const { name, quantity } of lines) {
    const item = catalog.get(nameKey(name));
    if (item !== undefined && used.has(item)) {
      added.set(item, (added.get(item) ?? 0) + quantity);
    } else {
      const key = nameKey(name);
      const earlier = ignored.get(key);
      ignored.set(key, {
        name: earlier?.name ?? item ?? name,
        quantity: (earlier?.quantity ?? 0) + quantity,
        reason: item === undefined ? "notAnItem" : "notUsedByRecipe",
      });
    }
  }

  const stock = new Map(data.hangar.stock);
  for (const [item, quantity] of added) {
    stock.set(item, (stock.get(item) ?? 0) + quantity);
  }
  return {
    data: added.size === 0 ? data : { ...data, hangar: { stock } },
    summary: {
      added: [...added].map(([item, quantity]) => ({ item, quantity })).sort((a, b) => compareNames(a.item, b.item)),
      ignored: [...ignored.values()].sort((a, b) => compareNames(a.name, b.name)),
      skipped,
    },
  };
}
