import { emptyData } from "../core/data/format";
import type { AppData } from "../core/data/model";
import { serializeFile } from "../core/data/serialize";
import { MemoryFileSystem } from "../storage/memoryFileSystem";
import { createQueue } from "./oneAtATime";
import { DataStore, refuse } from "./store";

/** A store over a folder holding `data` exactly as a previous build wrote it. */
function storeWith(data: AppData = emptyData("0.9.0")) {
  const fs = MemoryFileSystem.withFiles(
    Object.fromEntries((["manifest.json", "items.json", "recipes.json", "hangar.json", "plans.json"] as const).map((f) => [f, serializeFile(f, data)])),
  );
  const store = new DataStore(fs, data, { appVersion: "1.0.0", queue: createQueue() });
  return { fs, store };
}

const addItem =
  (name: string) =>
  (data: AppData): AppData => ({ ...data, items: { ...data.items, uncategorised: [...data.items.uncategorised, name] } });

describe("DataStore", () => {
  it("writes only the files that changed, then shows the new data", async () => {
    const { fs, store } = storeWith();
    const before = fs.snapshot();

    expect(await store.apply(addItem("Tritanium"))).toEqual({ status: "saved" });

    const after = fs.snapshot();
    expect(after["items.json"]).toContain('"Tritanium"');
    expect(after["recipes.json"]).toBe(before["recipes.json"]);
    expect(after["hangar.json"]).toBe(before["hangar.json"]);
    expect(after["plans.json"]).toBe(before["plans.json"]);
    expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());
    expect(store.current.items.uncategorised).toEqual(["Tritanium"]);
  });

  it("brings writtenBy up to date with the first commit by a newer build", async () => {
    const { fs, store } = storeWith(emptyData("0.9.0"));
    await store.apply(addItem("Tritanium"));
    expect(fs.snapshot()["manifest.json"]).toContain('"writtenBy": "1.0.0"');
    expect(store.current.manifest.writtenBy).toBe("1.0.0");
  });

  it("writes nothing, not even the manifest, when the change changes nothing", async () => {
    const { fs, store } = storeWith(emptyData("0.9.0"));
    const before = fs.snapshot();
    expect(await store.apply((data) => ({ ...data }))).toEqual({ status: "saved" });
    expect(fs.snapshot()).toEqual(before);
  });

  it("leaves the data unchanged, on disk and in memory, when the commit fails", async () => {
    const { fs, store } = storeWith();
    const before = fs.snapshot();
    const data = store.current;
    const listener = vi.fn();
    store.subscribe(listener);
    fs.failOn("rename", new Error("the disk is full"));

    const result = await store.apply(addItem("Tritanium"));

    expect(result).toEqual({ status: "failed", message: "the changes could not be saved: the disk is full" });
    expect(store.current).toBe(data);
    expect(fs.snapshot()).toEqual(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("shows the new data with a warning when the commit got past its commit point but could not finish", async () => {
    const { fs, store } = storeWith();
    // Lets the .tmp writes, the marker write and the marker rename through; the first rename after the commit point fails.
    let renames = 0;
    const rename = fs.rename.bind(fs);
    fs.rename = async (from, to) => {
      if (++renames > 1) {
        throw new Error("file is locked");
      }
      return rename(from, to);
    };

    const result = await store.apply(addItem("Tritanium"));

    expect(result.status).toBe("saved");
    expect(result.status === "saved" && result.warning).toMatch(/saved but could not be completed/);
    expect(store.current.items.uncategorised).toEqual(["Tritanium"]);
  });

  it("writes nothing when the action refuses, and passes the reason on", async () => {
    const { fs, store } = storeWith();
    const before = fs.snapshot();
    expect(await store.apply(() => refuse({ field: "name", message: "already in use" }))).toEqual({
      status: "refused",
      reason: { field: "name", message: "already in use" },
    });
    expect(fs.snapshot()).toEqual(before);
  });

  it("refuses to write data the next start could not read", async () => {
    const { fs, store } = storeWith();
    const before = fs.snapshot();
    const result = await store.apply(addItem(" Tritanium"));
    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.message).toMatch(/would leave data that cannot be read again: items\.json/);
    expect(fs.snapshot()).toEqual(before);
    expect(store.current.items.uncategorised).toEqual([]);
  });

  it("reports an action that throws as a failure, writing nothing", async () => {
    const { fs, store } = storeWith();
    const before = fs.snapshot();
    const result = await store.apply(() => {
      throw new Error("bug");
    });
    expect(result).toEqual({ status: "failed", message: "something went wrong: bug" });
    expect(fs.snapshot()).toEqual(before);
  });

  it("runs actions one at a time, each against the result of the one before", async () => {
    const { store } = storeWith();
    await Promise.all([store.apply(addItem("Tritanium")), store.apply(addItem("Pyerite")), store.apply(addItem("Mexallon"))]);
    expect(store.current.items.uncategorised).toEqual(["Tritanium", "Pyerite", "Mexallon"]);
  });

  it("notifies subscribers after a saved change, until they unsubscribe", async () => {
    const { store } = storeWith();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    await store.apply(addItem("Tritanium"));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    await store.apply(addItem("Pyerite"));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
