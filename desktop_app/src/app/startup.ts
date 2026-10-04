// The start-up sequence from design/upgrades.md: recover an interrupted write, create the
// folder on first start, then start, convert or refuse according to the manifest's
// formatVersion. Nothing is written unless the data is sound, or a conversion of it is.

import type { DataError } from "../core/data/dataError";
import { CONVERSION_STEPS, CURRENT_FORMAT, convertData, emptyData, type ConversionStep, type RawDataFiles } from "../core/data/format";
import { parseJson } from "../core/data/jsonParse";
import { loadData, type DataFileTexts } from "../core/data/load";
import { DATA_FILES, type AppData } from "../core/data/model";
import { serializeFile, serializeManifest } from "../core/data/serialize";
import { commit, COMMIT_MARKER, recover } from "../storage/commit";
import type { FileSystem } from "../storage/fileSystem";

export interface ConversionReport {
  from: number;
  to: number;
  /** The version that last wrote the data before the conversion. */
  writtenBy: string;
  /** Where the pre-conversion copy is, relative to the data folder. */
  backupFolder: string;
  /** Each applied step's description. */
  steps: string[];
}

export type StartupResult =
  | { kind: "ready"; data: AppData; conversion?: ConversionReport }
  | { kind: "malformed"; errors: DataError[] }
  | { kind: "newer"; formatVersion: number; writtenBy: string }
  | { kind: "conversionFailed"; from: number; to: number; step?: string; errors: string[] }
  | { kind: "failed"; message: string };

export interface StartupOptions {
  appVersion: string;
  /** For naming backups. */
  now: () => Date;
  /** Overridable for tests; the real build uses CURRENT_FORMAT and CONVERSION_STEPS. */
  currentFormat?: number;
  steps?: readonly ConversionStep[];
}

export const BACKUPS_FOLDER = "backups";

export async function startUp(fs: FileSystem, options: StartupOptions): Promise<StartupResult> {
  try {
    return await run(fs, options);
  } catch (error) {
    return { kind: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}

async function run(fs: FileSystem, options: StartupOptions): Promise<StartupResult> {
  const currentFormat = options.currentFormat ?? CURRENT_FORMAT;

  await recover(fs);

  if (!(await fs.exists(""))) {
    return createFolder(fs, options.appVersion);
  }

  const manifestText = await fs.readText("manifest.json");
  if (manifestText === undefined) {
    return malformed("manifest.json", undefined, "the file is missing; put it back, for example from a copy of the data folder");
  }
  // Read only formatVersion (and writtenBy, for messages) at first: a newer format may have
  // changed anything else in the manifest, and must still be recognised as newer.
  const version = readVersion(manifestText);
  if (!version.ok) {
    return malformed("manifest.json", version.line, version.message);
  }

  if (version.formatVersion > currentFormat) {
    return { kind: "newer", formatVersion: version.formatVersion, writtenBy: version.writtenBy ?? "an unknown version" };
  }
  if (version.formatVersion === currentFormat) {
    const loaded = loadData(await readDataFiles(fs));
    return loaded.ok ? { kind: "ready", data: loaded.data } : { kind: "malformed", errors: loaded.errors };
  }
  return convert(fs, options, version.formatVersion, version.writtenBy ?? "an unknown version", currentFormat);
}

async function createFolder(fs: FileSystem, appVersion: string): Promise<StartupResult> {
  const data = emptyData(appVersion);
  await fs.createDir("");
  await commit(fs, { replace: new Map(DATA_FILES.map((f) => [f, serializeFile(f, data)])) });
  return { kind: "ready", data };
}

type VersionRead = { ok: true; formatVersion: number; writtenBy?: string } | { ok: false; line?: number; message: string };

function readVersion(text: string): VersionRead {
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return { ok: false, line: parsed.problems[0]?.line, message: parsed.problems[0]?.message ?? "unreadable" };
  }
  const root = parsed.value;
  if (root.kind !== "object") {
    return { ok: false, line: root.line, message: "expected an object" };
  }
  const field = (key: string) => root.entries.find((e) => e.key === key)?.value;
  const format = field("formatVersion");
  if (!format || format.kind !== "number" || !/^[1-9][0-9]*$/.test(format.raw) || !Number.isSafeInteger(format.value)) {
    return { ok: false, line: format?.line ?? root.line, message: "expected a whole-number formatVersion of at least 1" };
  }
  const writtenBy = field("writtenBy");
  return { ok: true, formatVersion: format.value, writtenBy: writtenBy?.kind === "string" ? writtenBy.value : undefined };
}

async function readDataFiles(fs: FileSystem): Promise<DataFileTexts> {
  const entries = await Promise.all(DATA_FILES.map(async (f) => [f, await fs.readText(f)] as const));
  return Object.fromEntries(entries) as DataFileTexts;
}

async function convert(fs: FileSystem, options: StartupOptions, from: number, writtenBy: string, to: number): Promise<StartupResult> {
  // 1. Read every data file raw: syntax and repeated keys only, nothing format-specific.
  const names = (await fs.list(""))
    .filter((e) => !e.isDir && e.name.endsWith(".json") && e.name !== "manifest.json" && e.name !== COMMIT_MARKER)
    .map((e) => e.name);
  const raw: RawDataFiles = new Map();
  const errors: DataError[] = [];
  for (const name of names) {
    const text = (await fs.readText(name)) ?? "";
    const parsed = parseJson(text);
    if (parsed.ok) {
      raw.set(name, JSON.parse(text.replace(/^\uFEFF/, "")) as unknown);
    } else {
      errors.push(...parsed.problems.map((p) => ({ file: name, line: p.line, message: p.message })));
    }
  }
  if (errors.length > 0) {
    return { kind: "malformed", errors };
  }

  // 2-4. Convert and validate in memory. On failure nothing has been written.
  const result = convertData(raw, from, to, options.appVersion, options.steps ?? CONVERSION_STEPS);
  if (!result.ok) {
    return { kind: "conversionFailed", from, to, step: result.step?.describe, errors: result.errors };
  }

  // 5. Back up every file as it was.
  const backupFolder = await backUp(fs, `format ${from} to ${to} - ${timestamp(options.now())}`);

  // 6. Commit the converted files and the new manifest in one go.
  const replace = new Map<string, string>(DATA_FILES.map((f) => [f, serializeFile(f, result.data)]));
  replace.set("manifest.json", serializeManifest({ formatVersion: to, writtenBy: options.appVersion }));
  await commit(fs, { replace, delete: result.dropped });

  return {
    kind: "ready",
    data: result.data,
    conversion: { from, to, writtenBy, backupFolder, steps: result.applied.map((s) => s.describe) },
  };
}

/** Copies every file at the top of the data folder into a new backup folder; returns its path. */
async function backUp(fs: FileSystem, baseName: string): Promise<string> {
  let folder = `${BACKUPS_FOLDER}/${baseName}`;
  for (let n = 2; await fs.exists(folder); n++) {
    folder = `${BACKUPS_FOLDER}/${baseName} (${n})`;
  }
  await fs.createDir(folder);
  for (const entry of await fs.list("")) {
    if (!entry.isDir) {
      await fs.copy(entry.name, `${folder}/${entry.name}`);
    }
  }
  return folder;
}

/** Local date and time for folder names: "2026-10-04 16-32". */
function timestamp(date: Date): string {
  const two = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}-${two(date.getMinutes())}`;
}

function malformed(file: string, line: number | undefined, message: string): StartupResult {
  return { kind: "malformed", errors: [{ file, line, message }] };
}
