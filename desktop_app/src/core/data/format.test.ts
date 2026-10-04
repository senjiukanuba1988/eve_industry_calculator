import { ENUMS, FIELDS } from "./decode";
import { fixtureTexts } from "./fixtures/fixture";
import { fixtureRaw, MOVE_STOCK, olderFormatRaw } from "./fixtures/olderFormat";
import { CONVERSION_STEPS, CURRENT_FORMAT, convertData, emptyData } from "./format";
import { loadData } from "./load";
import { DATA_FILES } from "./model";
import { serializeFile } from "./serialize";

const schemas = import.meta.glob<{ formatVersion: number; fields: unknown; enums: unknown }>("./fixtures/format-*.schema.json", {
  import: "default",
  eager: true,
});
const fixtureManifests = import.meta.glob<string>("./fixtures/format-*/manifest.json", { query: "?raw", import: "default", eager: true });

describe("format-change guard", () => {
  it("the file shapes are exactly those recorded for the current format", () => {
    const recorded = schemas[`./fixtures/format-${CURRENT_FORMAT}.schema.json`];
    const current = { formatVersion: CURRENT_FORMAT, fields: FIELDS, enums: ENUMS };
    expect(
      recorded && JSON.parse(JSON.stringify(recorded)),
      `What the data files can contain has changed, but CURRENT_FORMAT is still ${CURRENT_FORMAT}. ` +
        `Every change to a file's shape, even one optional field, is a new format (design/upgrades.md): ` +
        `raise CURRENT_FORMAT, add a conversion step, add fixtures/format-${CURRENT_FORMAT + 1}/ and ` +
        `fixtures/format-${CURRENT_FORMAT + 1}.schema.json holding:\n${JSON.stringify(current, null, 2)}\n` +
        `(Before the first real release the format may still change in place - then update the existing schema file.)`,
    ).toEqual(JSON.parse(JSON.stringify(current)));
  });

  it("every format up to the current one has a fixture folder and a schema", () => {
    for (let format = 1; format <= CURRENT_FORMAT; format++) {
      expect(fixtureManifests[`./fixtures/format-${format}/manifest.json`], `fixtures/format-${format}/ is missing`).toBeDefined();
      expect(schemas[`./fixtures/format-${format}.schema.json`], `fixtures/format-${format}.schema.json is missing`).toBeDefined();
    }
  });

  it("there is exactly one conversion step for every format change", () => {
    expect(CONVERSION_STEPS.map((s) => s.from)).toEqual(Array.from({ length: CURRENT_FORMAT - 1 }, (_, i) => i + 1));
  });
});

describe("the current fixture", () => {
  it("is in the current format and loads cleanly", () => {
    expect(JSON.parse(fixtureTexts()["manifest.json"]!).formatVersion).toBe(CURRENT_FORMAT);
    expect(loadData(fixtureTexts()).ok).toBe(true);
  });
});

describe("emptyData", () => {
  it("is valid data in the current format", () => {
    const data = emptyData("1.0.0");
    const texts = Object.fromEntries(DATA_FILES.map((f) => [f, serializeFile(f, data)])) as Record<(typeof DATA_FILES)[number], string>;
    expect(loadData(texts)).toEqual({ ok: true, data });
    expect(texts["items.json"]).toBe('{\n  "categories": {},\n  "uncategorised": []\n}\n');
  });
});

describe("convertData", () => {
  it("converts through the chain, validates, and reports applied steps and dropped files", () => {
    const result = convertData(olderFormatRaw(), 1, 2, "2.0.0", [MOVE_STOCK]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.applied).toEqual([MOVE_STOCK]);
      expect(result.dropped).toEqual(["stock.json"]);
      expect(result.data.hangar.stock.get("Tritanium")).toBe(1000000);
      expect(result.data.manifest).toEqual({ formatVersion: 2, writtenBy: "2.0.0" });
    }
  });

  it("reports a step that throws, naming the step", () => {
    const raw = olderFormatRaw();
    raw.set("stock.json", { items: "nonsense" });
    expect(convertData(raw, 1, 2, "2.0.0", [MOVE_STOCK])).toEqual({
      ok: false,
      step: MOVE_STOCK,
      errors: ["stock.json → items: expected an object of item quantities"],
    });
  });

  it("reports a result that is not valid in the new format", () => {
    const raw = olderFormatRaw();
    raw.set("stock.json", { items: { Tritanium: 0 } });
    expect(convertData(raw, 1, 2, "2.0.0", [MOVE_STOCK])).toEqual({
      ok: false,
      step: MOVE_STOCK,
      errors: ['hangar.json: stock["Tritanium"]: expected a whole number of at least 1, found the number 0'],
    });
  });

  it("reports a missing step", () => {
    expect(convertData(olderFormatRaw(), 1, 2, "2.0.0", [])).toEqual({
      ok: false,
      errors: ["this version has no way to convert format 1 to 2"],
    });
  });

  it("refuses to leave behind a file the new format does not have", () => {
    const raw = fixtureRaw();
    raw.set("notes.json", {});
    const result = convertData(raw, 1, 1, "1.0.0", []);
    expect(result).toMatchObject({ ok: false, errors: ["notes.json is not a data file of format 1; move it out of the data folder"] });
  });

  it("does not change its input", () => {
    const raw = olderFormatRaw();
    const before = JSON.stringify([...raw]);
    convertData(raw, 1, 2, "2.0.0", [MOVE_STOCK]);
    expect(JSON.stringify([...raw])).toBe(before);
  });
});

