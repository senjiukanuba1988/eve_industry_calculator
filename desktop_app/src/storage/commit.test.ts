import { commit, CommitError, COMMIT_MARKER, recover, type FileChanges } from "./commit";
import { MemoryFileSystem, SimulatedCrash } from "./memoryFileSystem";

const BEFORE = {
  "hangar.json": "hangar v1\n",
  "items.json": "items v1\n",
  "manifest.json": "manifest v1\n",
  "plans.json": "plans v1\n",
};

// Starting a step: hangar and plans change together. Plus, as a conversion would,
// a new file appears and one is deleted, so every kind of change is exercised.
const CHANGES: FileChanges = {
  replace: new Map([
    ["hangar.json", "hangar v2\n"],
    ["plans.json", "plans v2 - a longer text than before\n"],
    ["recipes.json", "recipes, new file\n"],
  ]),
  delete: ["items.json"],
};

const AFTER = {
  "hangar.json": "hangar v2\n",
  "manifest.json": "manifest v1\n",
  "plans.json": "plans v2 - a longer text than before\n",
  "recipes.json": "recipes, new file\n",
};

/** How many changing operations a commit of CHANGES takes when nothing goes wrong. */
async function operationsInACommit(): Promise<number> {
  const fs = MemoryFileSystem.withFiles(BEFORE);
  await commit(fs, CHANGES);
  return fs.mutations;
}

describe("commit", () => {
  it("replaces, creates and deletes files, leaving nothing temporary behind", async () => {
    const fs = MemoryFileSystem.withFiles(BEFORE);
    await commit(fs, CHANGES);
    expect(fs.snapshot()).toEqual(AFTER);
  });

  it("writes every new file before the commit point and touches no original before it", async () => {
    const fs = MemoryFileSystem.withFiles(BEFORE);
    const seen: string[] = [];
    const rename = fs.rename.bind(fs);
    fs.rename = async (from, to) => {
      if (to === COMMIT_MARKER) {
        seen.push(...Object.keys(fs.snapshot()));
        expect(fs.snapshot()).toMatchObject(BEFORE);
      }
      return rename(from, to);
    };
    await commit(fs, CHANGES);
    expect(seen).toEqual(expect.arrayContaining(["hangar.json.tmp", "plans.json.tmp", "recipes.json.tmp", "commit.json.tmp"]));
  });

  it("leaves the data untouched and cleans up when writing fails before the commit point", async () => {
    const fs = MemoryFileSystem.withFiles(BEFORE);
    let writes = 0;
    const write = fs.writeText.bind(fs);
    fs.writeText = async (path, text) => {
      if (++writes === 2) {
        throw new Error("disk full");
      }
      return write(path, text);
    };
    const error = await commit(fs, CHANGES).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CommitError);
    expect(error).toMatchObject({ committed: false, message: "the changes could not be saved: disk full" });
    expect(fs.snapshot()).toEqual(BEFORE);
  });

  it("finishes by itself when a step after the commit point fails once", async () => {
    const fs = MemoryFileSystem.withFiles(BEFORE);
    let failed = false;
    const rename = fs.rename.bind(fs);
    fs.rename = async (from, to) => {
      if (from === "plans.json.tmp" && !failed) {
        failed = true;
        throw new Error("file locked");
      }
      return rename(from, to);
    };
    await commit(fs, CHANGES);
    expect(fs.snapshot()).toEqual(AFTER);
  });

  it("reports a saved-but-unfinished commit when finishing keeps failing", async () => {
    const fs = MemoryFileSystem.withFiles(BEFORE);
    const rename = fs.rename.bind(fs);
    fs.rename = async (from, to) => {
      if (from === "plans.json.tmp") {
        throw new Error("file locked");
      }
      return rename(from, to);
    };
    await expect(commit(fs, CHANGES)).rejects.toMatchObject({ committed: true });
    fs.rename = rename;
    await recover(fs);
    expect(fs.snapshot()).toEqual(AFTER);
  });
});

describe("a crash at any point", () => {
  it("leaves the folder wholly before or wholly after the commit, once recovered", async () => {
    const total = await operationsInACommit();
    const outcomes: string[] = [];
    for (let n = 0; n < total; n++) {
      const fs = MemoryFileSystem.withFiles(BEFORE);
      fs.crashAfter(n);
      await expect(commit(fs, CHANGES)).rejects.toBeInstanceOf(CommitError);

      fs.restart();
      await recover(fs);
      const state = fs.snapshot();
      expect([BEFORE, AFTER]).toContainEqual(state);
      outcomes.push(JSON.stringify(state) === JSON.stringify(BEFORE) ? "before" : "after");
    }
    expect(outcomes).toHaveLength(total);
    // Before the commit point the change is lost, from it on it is kept: never a mix.
    const firstAfter = outcomes.indexOf("after");
    expect(firstAfter).toBeGreaterThan(0);
    expect(outcomes.slice(0, firstAfter).every((o) => o === "before")).toBe(true);
    expect(outcomes.slice(firstAfter).every((o) => o === "after")).toBe(true);
  });

  it("still ends consistent when recovery itself is interrupted, at any point", async () => {
    const total = await operationsInACommit();
    for (let n = 0; n < total; n++) {
      // How many operations does recovery take after a crash at n?
      const probe = MemoryFileSystem.withFiles(BEFORE);
      probe.crashAfter(n);
      await commit(probe, CHANGES).catch(() => undefined);
      probe.restart();
      const startRecovery = probe.mutations;
      await recover(probe);
      const expected = probe.snapshot();
      const recoverySteps = probe.mutations - startRecovery;

      for (let m = 0; m < recoverySteps; m++) {
        const fs = MemoryFileSystem.withFiles(BEFORE);
        fs.crashAfter(n);
        await commit(fs, CHANGES).catch(() => undefined);
        fs.restart();
        fs.crashAfter(m);
        await expect(recover(fs)).rejects.toBeInstanceOf(SimulatedCrash);
        fs.restart();
        await recover(fs);
        expect(fs.snapshot()).toEqual(expected);
      }
    }
  });

  it("is completed even when a torn write left half a temporary file", async () => {
    // Crash during the very first write: hangar.json.tmp holds half its text.
    const fs = MemoryFileSystem.withFiles(BEFORE);
    fs.crashAfter(0);
    await commit(fs, CHANGES).catch(() => undefined);
    fs.restart();
    expect((await fs.list("")).map((e) => e.name)).toContain("hangar.json.tmp");
    expect(await recover(fs)).toEqual({ rolledForward: false, discarded: ["hangar.json.tmp"] });
    expect(fs.snapshot()).toEqual(BEFORE);
  });
});

describe("recover", () => {
  it("does nothing to a clean folder", async () => {
    const fs = MemoryFileSystem.withFiles(BEFORE);
    expect(await recover(fs)).toEqual({ rolledForward: false, discarded: [] });
    expect(fs.snapshot()).toEqual(BEFORE);
  });

  it("does nothing when the folder does not exist yet", async () => {
    expect(await recover(new MemoryFileSystem())).toEqual({ rolledForward: false, discarded: [] });
  });

  it("rolls a committed change forward and says so", async () => {
    const fs = MemoryFileSystem.withFiles({
      ...BEFORE,
      "hangar.json.tmp": "hangar v2\n",
      [COMMIT_MARKER]: JSON.stringify({ replace: ["hangar.json"], delete: [] }),
    });
    expect(await recover(fs)).toEqual({ rolledForward: true, discarded: [] });
    expect(fs.snapshot()).toEqual({ ...BEFORE, "hangar.json": "hangar v2\n" });
  });

  it("leaves files in subfolders alone, such as backups", async () => {
    const fs = MemoryFileSystem.withFiles(BEFORE);
    await fs.createDir("backups/old");
    await fs.writeText("backups/old/items.json.tmp", "keep");
    await recover(fs);
    expect(await fs.readText("backups/old/items.json.tmp")).toBe("keep");
  });

  it("refuses to guess when the commit marker is unreadable", async () => {
    const fs = MemoryFileSystem.withFiles({ ...BEFORE, [COMMIT_MARKER]: '{"replace": "oops"}' });
    await expect(recover(fs)).rejects.toThrow("commit.json is unreadable");
    expect(fs.snapshot()).toEqual({ ...BEFORE, [COMMIT_MARKER]: '{"replace": "oops"}' });
  });

  it("refuses a marker naming a path outside the folder's top level", async () => {
    const fs = MemoryFileSystem.withFiles({ ...BEFORE, [COMMIT_MARKER]: '{"replace": ["backups/x"], "delete": []}' });
    await expect(recover(fs)).rejects.toThrow("commit.json is unreadable");
  });
});
