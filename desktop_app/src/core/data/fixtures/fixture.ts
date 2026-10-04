// Test helpers around the format-1 fixture folder.

import type { DataFileTexts } from "../load";
import { DATA_FILES, type DataFileName } from "../model";

const files = import.meta.glob<string>("./format-1/*.json", { query: "?raw", import: "default", eager: true });

/** The text of every file in the format-1 fixture folder. */
export function fixtureTexts(): DataFileTexts {
  return Object.fromEntries(DATA_FILES.map((f) => [f, files[`./format-1/${f}`]])) as DataFileTexts;
}

/** The fixture with one exact piece of text in one file replaced; fails if the text is not there exactly once. */
export function editFixture(file: DataFileName, from: string, to: string, texts: DataFileTexts = fixtureTexts()): DataFileTexts {
  const text = texts[file]!;
  const at = text.indexOf(from);
  if (at < 0 || text.indexOf(from, at + 1) >= 0) {
    throw new Error(`expected ${JSON.stringify(from)} exactly once in ${file}`);
  }
  return { ...texts, [file]: text.slice(0, at) + to + text.slice(at + from.length) };
}

/** The 1-based line on which a piece of text first appears, after `after` if given. */
export function lineOf(text: string, snippet: string, after = ""): number {
  const start = after === "" ? 0 : text.indexOf(after);
  const at = text.indexOf(snippet, start);
  if (start < 0 || at < 0) {
    throw new Error(`${JSON.stringify(snippet)} not found`);
  }
  return text.slice(0, at).split("\n").length;
}
