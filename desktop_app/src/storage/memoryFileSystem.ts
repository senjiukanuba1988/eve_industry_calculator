import type { Entry, FileSystem } from "./fileSystem";

/** Thrown by every operation of a MemoryFileSystem from the moment it has "crashed". */
export class SimulatedCrash extends Error {
  constructor() {
    super("simulated crash");
  }
}

/**
 * A file system held in memory, behaving like the Tauri one: the same results for
 * missing files and folders, and the same failures. For tests it can simulate the
 * process dying at any point (see `crashAfter`).
 */
export class MemoryFileSystem implements FileSystem {
  protected files = new Map<string, string>();
  protected dirs = new Set<string>();
  /** How many changing operations have run, crashed or not. */
  mutations = 0;
  private crashAt: number | undefined;
  private crashed = false;
  private failures = new Map<string, Error>();

  /** A file system whose root folder exists, holding the given files. */
  static withFiles(files: Record<string, string>): MemoryFileSystem {
    const fs = new MemoryFileSystem();
    fs.dirs.add("");
    for (const [path, text] of Object.entries(files)) {
      fs.files.set(path, text);
    }
    return fs;
  }

  /**
   * Lets `count` more changing operations succeed, then "crashes": the next one does
   * nothing (a write leaves half its text behind, as a torn write would) and every
   * operation after it fails, until `restart`.
   */
  crashAfter(count: number): void {
    this.crashAt = this.mutations + count;
  }

  /** The process starts again: operations work, and no crash is pending. */
  restart(): void {
    this.crashed = false;
    this.crashAt = undefined;
  }

  /** Makes every later call of one operation fail with the given error, like a full disk. */
  failOn(operation: "writeText" | "rename" | "remove" | "copy" | "createDir", error = new Error(`${operation} failed`)): void {
    this.failures.set(operation, error);
  }

  /** Every file and its text, sorted by path, for comparing whole states. */
  snapshot(): Record<string, string> {
    return Object.fromEntries([...this.files.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));
  }

  async readText(path: string): Promise<string | undefined> {
    this.checkAlive();
    return this.files.get(path);
  }

  async writeText(path: string, text: string): Promise<void> {
    this.mutate("writeText", () => this.files.set(path, text.slice(0, Math.floor(text.length / 2))));
    this.requireDir(parent(path), path);
    this.files.set(path, text);
    this.changed();
  }

  async rename(from: string, to: string): Promise<void> {
    this.mutate("rename");
    const text = this.files.get(from);
    if (text === undefined) {
      throw new Error(`could not rename ${JSON.stringify(from)}: not found`);
    }
    this.requireDir(parent(to), to);
    this.files.delete(from);
    this.files.set(to, text);
    this.changed();
  }

  async remove(path: string): Promise<void> {
    this.mutate("remove");
    this.files.delete(path);
    this.changed();
  }

  async list(path: string): Promise<Entry[]> {
    this.checkAlive();
    const prefix = path === "" ? "" : `${path}/`;
    const children = new Map<string, boolean>();
    for (const file of this.files.keys()) {
      if (file.startsWith(prefix) && !file.slice(prefix.length).includes("/")) {
        children.set(file.slice(prefix.length), false);
      }
    }
    for (const dir of this.dirs) {
      if (dir !== "" && dir !== path && dir.startsWith(prefix) && !dir.slice(prefix.length).includes("/")) {
        children.set(dir.slice(prefix.length), true);
      }
    }
    return [...children.entries()].map(([name, isDir]) => ({ name, isDir })).sort((a, b) => (a.name < b.name ? -1 : 1));
  }

  async copy(from: string, to: string): Promise<void> {
    this.mutate("copy");
    const text = this.files.get(from);
    if (text === undefined) {
      throw new Error(`could not copy ${JSON.stringify(from)}: not found`);
    }
    this.requireDir(parent(to), to);
    this.files.set(to, text);
    this.changed();
  }

  async createDir(path: string): Promise<void> {
    this.mutate("createDir");
    this.dirs.add("");
    let at = "";
    for (const part of path.split("/").filter((p) => p !== "")) {
      at = at === "" ? part : `${at}/${part}`;
      this.dirs.add(at);
    }
    this.changed();
  }

  async exists(path: string): Promise<boolean> {
    this.checkAlive();
    return this.files.has(path) || this.dirs.has(path);
  }

  /** Called after every successful change; the browser adapter persists here. */
  protected changed(): void {}

  private checkAlive(): void {
    if (this.crashed) {
      throw new SimulatedCrash();
    }
  }

  private mutate(operation: string, tornWrite?: () => void): void {
    this.checkAlive();
    const failure = this.failures.get(operation);
    if (failure) {
      throw failure;
    }
    this.mutations++;
    if (this.crashAt !== undefined && this.mutations > this.crashAt) {
      this.crashed = true;
      tornWrite?.();
      throw new SimulatedCrash();
    }
  }

  private requireDir(dir: string, path: string): void {
    if (!this.dirs.has(dir)) {
      throw new Error(`could not write ${JSON.stringify(path)}: folder ${JSON.stringify(dir)} does not exist`);
    }
  }
}

function parent(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}
