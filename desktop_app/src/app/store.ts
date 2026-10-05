// The data the running application works on, and the one way to change it: an action
// computes the new data in memory, the files that differ are written in one atomic
// commit, and only then does the screen see the new data. A commit that fails leaves the
// data exactly as it was, so the screen never shows something that is not on disk.

import { formatDataError } from "../core/data/dataError";
import { loadData, type DataFileTexts } from "../core/data/load";
import { DATA_FILES, type AppData, type DataFileName } from "../core/data/model";
import { serializeFile } from "../core/data/serialize";
import { isRefusal, type Refusal } from "../core/refusal";
import { commit, CommitError } from "../storage/commit";
import type { FileSystem } from "../storage/fileSystem";
import type { Queue } from "./oneAtATime";

export { refuse, type Refusal } from "../core/refusal";

/** Computes the new data from the current data, or refuses. Must not change `data` itself. */
export type Change<E = string> = (data: AppData) => AppData | Refusal<E>;

export type ActionResult<E = string> =
  /** The change is on disk and on screen. `warning` is set if it could not be finished now; the next start finishes it. */
  | { status: "saved"; warning?: string }
  /** The action refused; nothing was written. */
  | { status: "refused"; reason: E }
  /** Writing failed; nothing changed, on disk or on screen. */
  | { status: "failed"; message: string };

export interface StoreOptions {
  /** Written to manifest.json as writtenBy with every commit. */
  appVersion: string;
  /** Shared with everything else that writes to the data folder. */
  queue: Queue;
}

export class DataStore {
  private data: AppData;
  /** What each file holds on disk, as far as this store knows. */
  private written: Map<DataFileName, string>;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly fs: FileSystem,
    data: AppData,
    private readonly options: StoreOptions,
  ) {
    this.data = data;
    this.written = serializeAll(data);
  }

  /** The current data. Never mutate it; change it through `apply`. */
  get current(): AppData {
    return this.data;
  }

  /** Calls `listener` after every change; returns the function that unsubscribes it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Runs `change` against the latest data, after any action still in progress, and saves the result. */
  apply<E = string>(change: Change<E>): Promise<ActionResult<E>> {
    return this.options.queue(() => this.run(change));
  }

  private async run<E>(change: Change<E>): Promise<ActionResult<E>> {
    let outcome: AppData | Refusal<E>;
    try {
      outcome = change(this.data);
    } catch (error) {
      return { status: "failed", message: `something went wrong: ${message(error)}` };
    }
    if (isRefusal(outcome)) {
      return { status: "refused", reason: outcome.refused };
    }

    const texts = serializeAll(outcome);
    const changed = DATA_FILES.filter((f) => f !== "manifest.json" && texts.get(f) !== this.written.get(f));
    if (changed.length === 0) {
      return { status: "saved" };
    }

    // The first commit by a newer build brings writtenBy up to date (design/upgrades.md).
    const next: AppData = { ...outcome, manifest: { ...outcome.manifest, writtenBy: this.options.appVersion } };
    texts.set("manifest.json", serializeFile("manifest.json", next));
    if (texts.get("manifest.json") !== this.written.get("manifest.json")) {
      changed.push("manifest.json");
    }

    // Never write anything the next start would refuse to open.
    const reloaded = loadData(Object.fromEntries(texts) as DataFileTexts);
    if (!reloaded.ok) {
      return {
        status: "failed",
        message: `the change was not saved, because it would leave data that cannot be read again: ${reloaded.errors.map(formatDataError).join("; ")}`,
      };
    }

    let warning: string | undefined;
    try {
      await commit(this.fs, { replace: new Map(changed.map((f) => [f, texts.get(f)!])) });
    } catch (error) {
      if (!(error instanceof CommitError && error.committed)) {
        return { status: "failed", message: message(error) };
      }
      warning = error.message;
    }

    this.data = next;
    this.written = texts;
    for (const listener of this.listeners) {
      listener();
    }
    return warning === undefined ? { status: "saved" } : { status: "saved", warning };
  }
}

function serializeAll(data: AppData): Map<DataFileName, string> {
  return new Map(DATA_FILES.map((f) => [f, serializeFile(f, data)]));
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
