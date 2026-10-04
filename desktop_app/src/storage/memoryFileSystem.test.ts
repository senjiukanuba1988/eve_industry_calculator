import { BROWSER_STORAGE_KEY, BrowserFileSystem } from "./browserDataFolder";
import { MemoryFileSystem, SimulatedCrash } from "./memoryFileSystem";

// The fake must behave like the Rust file layer (src-tauri/src/files.rs), or tests
// against it would prove nothing about the real thing.
describe("MemoryFileSystem", () => {
  it("reads a missing file as undefined", async () => {
    expect(await MemoryFileSystem.withFiles({}).readText("plans.json")).toBeUndefined();
  });

  it("cannot write into a folder that does not exist", async () => {
    await expect(new MemoryFileSystem().writeText("items.json", "x")).rejects.toThrow('folder "" does not exist');
    await expect(MemoryFileSystem.withFiles({}).writeText("backups/a.json", "x")).rejects.toThrow('folder "backups" does not exist');
  });

  it("renames over an existing file and fails on a missing source", async () => {
    const fs = MemoryFileSystem.withFiles({ "a.tmp": "new", a: "old" });
    await fs.rename("a.tmp", "a");
    expect(fs.snapshot()).toEqual({ a: "new" });
    await expect(fs.rename("a.tmp", "a")).rejects.toThrow("not found");
  });

  it("treats deleting a missing file as done", async () => {
    await MemoryFileSystem.withFiles({}).remove("nothing");
  });

  it("lists files and folders directly inside a folder, sorted", async () => {
    const fs = MemoryFileSystem.withFiles({ "plans.json": "", "hangar.json": "" });
    await fs.createDir("backups/format 1 to 2");
    await fs.writeText("backups/format 1 to 2/items.json", "");
    expect(await fs.list("")).toEqual([
      { name: "backups", isDir: true },
      { name: "hangar.json", isDir: false },
      { name: "plans.json", isDir: false },
    ]);
    expect(await fs.list("backups")).toEqual([{ name: "format 1 to 2", isDir: true }]);
    expect(await fs.list("nowhere")).toEqual([]);
  });

  it("copies and checks existence of files and folders", async () => {
    const fs = MemoryFileSystem.withFiles({ "items.json": "items" });
    await fs.createDir("backups");
    await fs.copy("items.json", "backups/items.json");
    expect(await fs.readText("backups/items.json")).toBe("items");
    expect(await fs.exists("backups")).toBe(true);
    expect(await fs.exists("")).toBe(true);
    expect(await fs.exists("hangar.json")).toBe(false);
  });

  it("after a simulated crash, fails every operation until restarted", async () => {
    const fs = MemoryFileSystem.withFiles({});
    fs.crashAfter(1);
    await fs.writeText("a", "fine");
    await expect(fs.writeText("b", "abcdef")).rejects.toBeInstanceOf(SimulatedCrash);
    await expect(fs.readText("a")).rejects.toBeInstanceOf(SimulatedCrash);
    fs.restart();
    expect(fs.snapshot()).toEqual({ a: "fine", b: "abc" });
  });
});

describe("BrowserFileSystem", () => {
  beforeEach(() => localStorage.clear());

  it("keeps its files across page loads", async () => {
    const first = new BrowserFileSystem();
    await first.createDir("");
    await first.writeText("items.json", "{}\n");
    await first.createDir("backups");

    const second = new BrowserFileSystem();
    expect(await second.readText("items.json")).toBe("{}\n");
    expect(await second.exists("backups")).toBe(true);
  });

  it("starts empty, with no folder, when nothing was saved or the saved state is unreadable", async () => {
    localStorage.setItem(BROWSER_STORAGE_KEY, "not json");
    const fs = new BrowserFileSystem();
    expect(await fs.exists("")).toBe(false);
  });

  it("keeps working in memory when storage refuses to save", async () => {
    const full = { getItem: () => null, setItem: () => { throw new Error("quota exceeded"); } } as unknown as Storage;
    const fs = new BrowserFileSystem(full);
    await fs.createDir("");
    await fs.writeText("items.json", "x");
    expect(await fs.readText("items.json")).toBe("x");
  });
});
