// Data formats and the conversion between them (design/upgrades.md). Pure: the start-up
// sequence does the reading, backing up and writing around it.

import type { DataError } from "./dataError";
import { loadData, type DataFileTexts, type LoadResult } from "./load";
import { DATA_FILES, type AppData } from "./model";
import { serializeManifest } from "./serialize";

/**
 * The format this build reads and writes. Raise it by exactly 1 with every change to what
 * any file can contain - even one optional field - and add a conversion step for it.
 * The format-change guard test (format.test.ts) fails until both are done.
 */
export const CURRENT_FORMAT = 1;

/** Data file name to its parsed JSON, manifest excluded. */
export type RawDataFiles = Map<string, unknown>;

export interface ConversionStep {
  /** Converts format `from` to `from + 1`. */
  from: number;
  /** One line for the conversion message, e.g. "Recipes gain a facility field". */
  describe: string;
  /** Pure: no I/O, no clock, no randomness. Throws, naming file and path, on input it cannot convert. */
  convert(files: RawDataFiles): RawDataFiles;
}

/** Released conversion steps, in order. Never edit a released step; correct it with a new one. */
export const CONVERSION_STEPS: readonly ConversionStep[] = [];

export type ConversionResult =
  | { ok: true; data: AppData; applied: ConversionStep[]; dropped: string[] }
  | { ok: false; step?: ConversionStep; errors: string[] };

/**
 * Converts data files from format `from` to `to` in memory and validates the result as
 * format `to`. Nothing is written; on failure the caller leaves the files as they are.
 */
export function convertData(
  files: RawDataFiles,
  from: number,
  to: number,
  appVersion: string,
  steps: readonly ConversionStep[] = CONVERSION_STEPS,
): ConversionResult {
  let current = files;
  const applied: ConversionStep[] = [];
  for (let format = from; format < to; format++) {
    const step = steps.find((s) => s.from === format);
    if (!step) {
      return { ok: false, errors: [`this version has no way to convert format ${format} to ${format + 1}`] };
    }
    try {
      current = step.convert(new Map(current));
    } catch (error) {
      return { ok: false, step, errors: [error instanceof Error ? error.message : String(error)] };
    }
    applied.push(step);
  }

  const dataFiles = DATA_FILES.filter((f) => f !== "manifest.json") as string[];
  const unexpected = [...current.keys()].filter((name) => !dataFiles.includes(name));
  if (unexpected.length > 0) {
    return {
      ok: false,
      step: applied.at(-1),
      errors: unexpected.map((name) => `${name} is not a data file of format ${to}; move it out of the data folder`),
    };
  }

  const texts = Object.fromEntries(DATA_FILES.map((f) => [f, current.has(f) ? JSON.stringify(current.get(f)) : undefined])) as DataFileTexts;
  texts["manifest.json"] = serializeManifest({ formatVersion: to, writtenBy: appVersion });
  const loaded: LoadResult = loadData(texts);
  if (!loaded.ok) {
    return { ok: false, step: applied.at(-1), errors: loaded.errors.map(describeConverted) };
  }
  const dropped = [...files.keys()].filter((name) => !current.has(name));
  return { ok: true, data: loaded.data, applied, dropped };
}

/** Converted data was never a file, so its line numbers mean nothing; the messages name the path. */
function describeConverted(error: DataError): string {
  return `${error.file}: ${error.message}`;
}

/** What a brand-new data folder holds. */
export function emptyData(appVersion: string): AppData {
  return {
    manifest: { formatVersion: CURRENT_FORMAT, writtenBy: appVersion },
    items: { categories: new Map(), uncategorised: [] },
    recipes: [],
    hangar: { stock: new Map() },
    plans: [],
  };
}
