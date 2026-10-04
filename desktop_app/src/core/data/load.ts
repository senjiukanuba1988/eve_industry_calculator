// Reads the five data files, as text, into the data model, or explains why it cannot.
// Each file is parsed and decoded on its own, collecting what is wrong with it. The
// cross-file checks only run once every file is sound, since a broken file would make
// them report knock-on errors that disappear once it is fixed.
//
// This assumes the files are in the current format; deciding whether they are, and
// converting them if not, happens before this (design/upgrades.md).

import type { DataError } from "./dataError";
import { decodeHangar, decodeItems, decodeManifest, decodePlans, decodeRecipes, type Decoded } from "./decode";
import { parseJson, type JsonNode } from "./jsonParse";
import type { AppData, DataFileName } from "./model";
import { validateData } from "./validate";

/** File name to its text, or undefined where the file does not exist. */
export type DataFileTexts = Record<DataFileName, string | undefined>;

export type LoadResult = { ok: true; data: AppData } | { ok: false; errors: DataError[] };

export function loadData(texts: DataFileTexts): LoadResult {
  const manifest = loadFile("manifest.json", texts, decodeManifest);
  const items = loadFile("items.json", texts, decodeItems);
  const recipes = loadFile("recipes.json", texts, decodeRecipes);
  const hangar = loadFile("hangar.json", texts, decodeHangar);
  const plans = loadFile("plans.json", texts, decodePlans);

  if (!manifest.value || !items.value || !recipes.value || !hangar.value || !plans.value) {
    return { ok: false, errors: [manifest, items, recipes, hangar, plans].flatMap((f) => f.errors) };
  }

  const data: AppData = {
    manifest: manifest.value,
    items: items.value,
    recipes: recipes.value,
    hangar: hangar.value,
    plans: plans.value,
  };
  const errors = validateData(data, {
    "manifest.json": manifest.lines,
    "items.json": items.lines,
    "recipes.json": recipes.lines,
    "hangar.json": hangar.lines,
    "plans.json": plans.lines,
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, data };
}

function loadFile<T>(file: DataFileName, texts: DataFileTexts, decode: (root: JsonNode) => Decoded<T>): Decoded<T> {
  const text = texts[file];
  if (text === undefined) {
    return {
      value: undefined,
      errors: [{ file, message: "the file is missing; put it back, for example from a copy of the data folder" }],
      lines: new Map(),
    };
  }
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return { value: undefined, errors: parsed.problems.map((p) => ({ file, line: p.line, message: p.message })), lines: new Map() };
  }
  return decode(parsed.value);
}
