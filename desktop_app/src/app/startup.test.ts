import { fixtureTexts, lineOf } from "../core/data/fixtures/fixture";
import { MOVE_STOCK } from "../core/data/fixtures/olderFormat";
import { recover } from "../storage/commit";
import { MemoryFileSystem } from "../storage/memoryFileSystem";
import { startUp, type StartupOptions, type StartupResult } from "./startup";

const NOW = new Date(2026, 9, 4, 16, 32, 5); // local time: 2026-10-04 16:32:05
const OPTIONS: StartupOptions = { appVersion: "1.0.0", now: () => NOW };

function fixtureFolder(): MemoryFileSystem {
  return MemoryFileSystem.withFiles(fixtureTexts() as Record<string, string>);
}

/** The fixture as a made-up format 1, with the current format called 2 (see olderFormat.ts). */
function olderFolder(): MemoryFileSystem {
  const texts = fixtureTexts() as Record<string, string>;
  const hangar = JSON.parse(texts["hangar.json"]!) as { stock: unknown };
  const rest = { ...texts };
  delete rest["hangar.json"];
  return MemoryFileSystem.withFiles({
    ...rest,
    "manifest.json": '{\n  "formatVersion": 1,\n  "writtenBy": "0.9.0"\n}\n',
    "stock.json": JSON.stringify({ items: hangar.stock }, null, 2),
  });
}
const CONVERTING: StartupOptions = { appVersion: "2.0.0", now: () => NOW, currentFormat: 2, steps: [MOVE_STOCK] };

/** Files at the top of the folder only, leaving out backups. */
function topLevel(fs: MemoryFileSystem): Record<string, string> {
  return Object.fromEntries(Object.entries(fs.snapshot()).filter(([path]) => !path.includes("/")));
}

function backups(fs: MemoryFileSystem): string[] {
  return [...new Set(Object.keys(fs.snapshot()).filter((p) => p.startsWith("backups/")).map((p) => p.split("/")[1]!))];
}

function expectKind<K extends StartupResult["kind"]>(result: StartupResult, kind: K): Extract<StartupResult, { kind: K }> {
  expect(result.kind, JSON.stringify(result)).toBe(kind);
  return result as Extract<StartupResult, { kind: K }>;
}

describe("first start", () => {
  it("creates the folder with empty data files, and starts without a message", async () => {
    const fs = new MemoryFileSystem();
    const result = expectKind(await startUp(fs, OPTIONS), "ready");
    expect(result.conversion).toBeUndefined();
    expect(result.data.recipes).toEqual([]);
    expect(Object.keys(fs.snapshot())).toEqual(["hangar.json", "items.json", "manifest.json", "plans.json", "recipes.json"]);
    expect(JSON.parse(fs.snapshot()["manifest.json"]!)).toMatchObject({ formatVersion: 1, writtenBy: "1.0.0" });
  });

  it("starts normally the second time, against what it created", async () => {
    const fs = new MemoryFileSystem();
    await startUp(fs, OPTIONS);
    const before = fs.snapshot();
    expectKind(await startUp(fs, OPTIONS), "ready");
    expect(fs.snapshot()).toEqual(before);
  });
});

describe("data in the current format", () => {
  it("starts silently and writes nothing", async () => {
    const fs = fixtureFolder();
    const result = expectKind(await startUp(fs, OPTIONS), "ready");
    expect(result.conversion).toBeUndefined();
    expect(result.data.plans).toHaveLength(2);
    expect(fs.mutations).toBe(0);
  });

  it("starts, also when a newer build wrote it without changing the format", async () => {
    const fs = fixtureFolder();
    await fs.writeText("manifest.json", fs.snapshot()["manifest.json"]!.replace('"0.1.0"', '"9.9.9"'));
    expectKind(await startUp(fs, OPTIONS), "ready");
  });

  it("first completes a write that was interrupted after its commit point", async () => {
    const fs = fixtureFolder();
    const hangar = fs.snapshot()["hangar.json"]!.replace('"Tritanium": 1000000', '"Tritanium": 5');
    await fs.writeText("hangar.json.tmp", hangar);
    await fs.writeText("commit.json", JSON.stringify({ replace: ["hangar.json"], delete: [] }));
    const result = expectKind(await startUp(fs, OPTIONS), "ready");
    expect(result.data.hangar.stock.get("Tritanium")).toBe(5);
    expect(Object.keys(fs.snapshot())).not.toContain("commit.json");
  });
});

describe("malformed data", () => {
  it("names the file and line, and leaves every file exactly as it was", async () => {
    const fs = fixtureFolder();
    await fs.writeText("recipes.json", fs.snapshot()["recipes.json"]!.replace('"Sulfuric Acid": 98', '"Sulfuric Acd": 98'));
    const before = fs.snapshot();
    const result = expectKind(await startUp(fs, OPTIONS), "malformed");
    expect(result.errors).toEqual([
      expect.objectContaining({
        file: "recipes.json",
        line: lineOf(before["recipes.json"]!, '"Sulfuric Acd"'),
        message: 'input "Sulfuric Acd" is not an item in items.json',
      }),
    ]);
    expect(fs.snapshot()).toEqual(before);
  });

  it("starts normally once the file is fixed and it is tried again", async () => {
    const fs = fixtureFolder();
    const good = fs.snapshot()["hangar.json"]!;
    await fs.writeText("hangar.json", good.replace("98,", "98"));
    expectKind(await startUp(fs, OPTIONS), "malformed");
    await fs.writeText("hangar.json", good);
    expectKind(await startUp(fs, OPTIONS), "ready");
  });

  it("reports a missing data file rather than starting with it empty", async () => {
    const fs = fixtureFolder();
    await fs.remove("recipes.json");
    const result = expectKind(await startUp(fs, OPTIONS), "malformed");
    expect(result.errors).toEqual([expect.objectContaining({ file: "recipes.json", message: expect.stringContaining("the file is missing") })]);
    expect(Object.keys(fs.snapshot())).not.toContain("recipes.json");
  });

  it.each([
    ["missing", undefined, undefined, "the file is missing"],
    ["not JSON", "{ formatVersion: 1 }", 1, "expected a key in double quotes"],
    ["without a formatVersion", '{\n  "writtenBy": "1.0.0"\n}\n', 1, "expected a whole-number formatVersion of at least 1"],
    ["with a formatVersion that is not a whole number", '{\n  "formatVersion": "1"\n}\n', 2, "expected a whole-number formatVersion of at least 1"],
  ])("reports a manifest that is %s", async (_, text, line, message) => {
    const fs = fixtureFolder();
    if (text === undefined) {
      await fs.remove("manifest.json");
    } else {
      await fs.writeText("manifest.json", text);
    }
    const result = expectKind(await startUp(fs, OPTIONS), "malformed");
    expect(result.errors).toEqual([{ file: "manifest.json", line, message: expect.stringContaining(message) }]);
  });

  it("reports a folder that exists but is empty, instead of filling it", async () => {
    const fs = MemoryFileSystem.withFiles({});
    expectKind(await startUp(fs, OPTIONS), "malformed");
    expect(fs.snapshot()).toEqual({});
  });
});

describe("data in a newer format", () => {
  it("refuses, naming the version that wrote it, and changes nothing", async () => {
    const fs = fixtureFolder();
    // A future format may change anything, the manifest included.
    await fs.writeText("manifest.json", '{\n  "formatVersion": 2,\n  "writtenBy": "1.4.0",\n  "somethingNew": true\n}\n');
    const before = fs.snapshot();
    const mutations = fs.mutations;
    expect(await startUp(fs, OPTIONS)).toEqual({ kind: "newer", formatVersion: 2, writtenBy: "1.4.0" });
    expect(fs.snapshot()).toEqual(before);
    expect(fs.mutations).toBe(mutations);
  });
});

describe("data in an older format", () => {
  it("converts, backs up the old files, commits, and reports it", async () => {
    const fs = olderFolder();
    const before = fs.snapshot();
    const result = expectKind(await startUp(fs, CONVERTING), "ready");

    expect(result.conversion).toEqual({
      from: 1,
      to: 2,
      writtenBy: "0.9.0",
      backupFolder: "backups/format 1 to 2 - 2026-10-04 16-32",
      steps: ["Hangar stock moves from stock.json to hangar.json"],
    });
    expect(result.data.hangar.stock.get("Tritanium")).toBe(1000000);

    // The backup holds every file exactly as it was.
    const backup = Object.fromEntries(
      Object.entries(fs.snapshot())
        .filter(([p]) => p.startsWith("backups/format 1 to 2 - 2026-10-04 16-32/"))
        .map(([p, text]) => [p.split("/")[2], text]),
    );
    expect(backup).toEqual(before);

    // The folder is in the new format; the dropped file is gone.
    const now = topLevel(fs);
    expect(Object.keys(now)).toEqual(["hangar.json", "items.json", "manifest.json", "plans.json", "recipes.json"]);
    expect(JSON.parse(now["manifest.json"]!)).toMatchObject({ formatVersion: 2, writtenBy: "2.0.0" });
  });

  it("shows the message once: the next start is silent and makes no second backup", async () => {
    const fs = olderFolder();
    await startUp(fs, CONVERTING);
    const result = expectKind(await startUp(fs, CONVERTING), "ready");
    expect(result.conversion).toBeUndefined();
    expect(backups(fs)).toHaveLength(1);
  });

  it("adds a suffix when a backup of that name already exists", async () => {
    const fs = olderFolder();
    await fs.createDir("backups/format 1 to 2 - 2026-10-04 16-32");
    const result = expectKind(await startUp(fs, CONVERTING), "ready");
    expect(result.conversion?.backupFolder).toBe("backups/format 1 to 2 - 2026-10-04 16-32 (2)");
  });

  it("leaves every file exactly as it was when a step fails, with no backup and no commit", async () => {
    const fs = olderFolder();
    await fs.writeText("stock.json", '{ "items": "nonsense" }');
    const before = fs.snapshot();
    expect(await startUp(fs, CONVERTING)).toEqual({
      kind: "conversionFailed",
      from: 1,
      to: 2,
      step: "Hangar stock moves from stock.json to hangar.json",
      errors: ["stock.json → items: expected an object of item quantities"],
    });
    expect(fs.snapshot()).toEqual(before);
    expect(await fs.exists("backups")).toBe(false);
  });

  it("leaves every file as it was when the converted data would be invalid", async () => {
    const fs = olderFolder();
    await fs.writeText("stock.json", '{ "items": { "Tritanium": 0 } }');
    const before = fs.snapshot();
    expectKind(await startUp(fs, CONVERTING), "conversionFailed");
    expect(fs.snapshot()).toEqual(before);
  });

  it("reports a syntax error in an old file with its line, before converting anything", async () => {
    const fs = olderFolder();
    await fs.writeText("stock.json", '{\n  "items": {\n}');
    const result = expectKind(await startUp(fs, CONVERTING), "malformed");
    expect(result.errors).toEqual([{ file: "stock.json", line: 3, message: 'expected "," or "}", found the end of the file' }]);
  });

  it("survives a crash at any point: the data is old or converted, and the next start finishes the job", async () => {
    const probe = olderFolder();
    await startUp(probe, CONVERTING);
    const total = probe.mutations;
    const converted = topLevel(probe);
    const original = topLevel(olderFolder());

    const outcomes = new Set<string>();
    for (let n = 0; n < total; n++) {
      const fs = olderFolder();
      fs.crashAfter(n);
      expectKind(await startUp(fs, CONVERTING), "failed");
      fs.restart();

      // Once an interrupted write is recovered, the data is wholly old or wholly converted.
      await recover(fs);
      const state = topLevel(fs);
      expect([original, converted]).toContainEqual(state);
      const wasConverted = JSON.stringify(state) === JSON.stringify(converted);
      outcomes.add(wasConverted ? "converted" : "original");

      // The next start finishes the job: converting again if needed, which makes another backup.
      const next = expectKind(await startUp(fs, CONVERTING), "ready");
      expect(topLevel(fs)).toEqual(converted);
      expect(next.conversion !== undefined).toBe(!wasConverted);
      expect(backups(fs).length).toBe(wasConverted ? 1 : backups(fs).length);
      expect(backups(fs).length).toBeGreaterThanOrEqual(1);
    }
    expect(outcomes).toEqual(new Set(["original", "converted"]));
  });
});

describe("failures", () => {
  it("reports a commit marker it cannot read, without touching anything", async () => {
    const fs = fixtureFolder();
    await fs.writeText("commit.json", "garbage");
    const before = fs.snapshot();
    const result = expectKind(await startUp(fs, OPTIONS), "failed");
    expect(result.message).toContain("commit.json is unreadable");
    expect(fs.snapshot()).toEqual(before);
  });
});
