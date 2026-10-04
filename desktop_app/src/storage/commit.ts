// The atomic commit protocol from design/data-files.md ("Atomic writes"), which makes an
// action that changes several files land either wholly or not at all:
//
//   1. write each changed file's new text to <name>.tmp
//   2. write commit.json (what to replace and delete) to commit.json.tmp, then rename it
//      into place - this rename is the commit point
//   3. rename each <name>.tmp over <name>, and delete the files to delete
//   4. delete commit.json
//
// On start, `recover` finishes an action that got past the commit point, and throws away
// the leftovers of one that did not.

import type { FileSystem } from "./fileSystem";

export const COMMIT_MARKER = "commit.json";
const TMP = ".tmp";

export interface FileChanges {
  /** File name to its complete new text. */
  replace: ReadonlyMap<string, string>;
  /** Files to delete. Only conversions between formats delete files. */
  delete?: readonly string[];
}

interface Marker {
  replace: string[];
  delete: string[];
}

/** A commit that failed. `committed` says whether the change will nevertheless take effect. */
export class CommitError extends Error {
  constructor(
    message: string,
    /** True when the commit point was passed: the change is saved and is completed on the next start at the latest. */
    readonly committed: boolean,
    options?: { cause: unknown },
  ) {
    super(message, options);
  }
}

export interface RecoveryReport {
  /** An interrupted commit was completed. */
  rolledForward: boolean;
  /** Temporary files of a commit that never happened, now deleted. */
  discarded: string[];
}

/**
 * Writes the changes atomically. Resolves once every file is in place. Rejects with a
 * CommitError otherwise: with `committed: false` nothing changed; with `committed: true`
 * the change was saved but could not be finished now, and `recover` finishes it.
 */
export async function commit(fs: FileSystem, changes: FileChanges): Promise<void> {
  const replace = [...changes.replace.keys()];
  const marker: Marker = { replace, delete: [...(changes.delete ?? [])] };

  try {
    for (const [name, text] of changes.replace) {
      await fs.writeText(name + TMP, text);
    }
    await fs.writeText(COMMIT_MARKER + TMP, JSON.stringify(marker, null, 2) + "\n");
    await fs.rename(COMMIT_MARKER + TMP, COMMIT_MARKER);
  } catch (error) {
    await discardTemporaryFiles(fs).catch(() => undefined);
    throw new CommitError(`the changes could not be saved: ${message(error)}`, false, { cause: error });
  }

  try {
    await applyMarker(fs, marker);
  } catch (first) {
    // Past the commit point: try once more to finish, as a restart would.
    try {
      await recover(fs);
    } catch {
      throw new CommitError(
        `the changes were saved but could not be completed; they will be on the next start: ${message(first)}`,
        true,
        { cause: first },
      );
    }
  }
}

/**
 * Brings the folder to a consistent state after an interrupted commit: completes it if it
 * reached the commit point, otherwise deletes its temporary files. Safe to run at any
 * time, any number of times, including after a crash during an earlier recovery.
 */
export async function recover(fs: FileSystem): Promise<RecoveryReport> {
  const markerText = await fs.readText(COMMIT_MARKER);
  let rolledForward = false;
  if (markerText !== undefined) {
    await applyMarker(fs, parseMarker(markerText));
    rolledForward = true;
  }
  const discarded = await discardTemporaryFiles(fs);
  return { rolledForward, discarded };
}

async function applyMarker(fs: FileSystem, marker: Marker): Promise<void> {
  for (const name of marker.replace) {
    // A missing .tmp was already renamed into place before the interruption.
    if (await fs.exists(name + TMP)) {
      await fs.rename(name + TMP, name);
    }
  }
  for (const name of marker.delete) {
    await fs.remove(name);
  }
  await fs.remove(COMMIT_MARKER);
}

async function discardTemporaryFiles(fs: FileSystem): Promise<string[]> {
  const stray = (await fs.list("")).filter((e) => !e.isDir && e.name.endsWith(TMP)).map((e) => e.name);
  for (const name of stray) {
    await fs.remove(name);
  }
  return stray;
}

function parseMarker(text: string): Marker {
  try {
    const value = JSON.parse(text) as unknown;
    if (isMarker(value)) {
      return value;
    }
  } catch {
    // fall through
  }
  throw new Error(
    `${COMMIT_MARKER} is unreadable, so an interrupted save cannot be completed. ` +
      `It is only ever written by the application; if it was edited, restore it or the data folder from a copy.`,
  );
}

function isMarker(value: unknown): value is Marker {
  const names = (v: unknown) => Array.isArray(v) && v.every((n) => typeof n === "string" && n !== "" && !n.includes("/"));
  return typeof value === "object" && value !== null && names((value as Marker).replace) && names((value as Marker).delete);
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
