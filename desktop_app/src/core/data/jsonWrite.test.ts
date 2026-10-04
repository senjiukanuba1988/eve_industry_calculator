import { JsonObjectOut, obj, writeJson } from "./jsonWrite";

describe("writeJson", () => {
  it("writes the same layout as JSON.stringify with two spaces, plus a trailing newline", () => {
    const value = { a: "x", b: [1, true, { c: [] }], d: {}, e: 'quote " and é' };
    const out = obj(["a", "x"], ["b", [1, true, obj(["c", []])]], ["d", obj()], ["e", 'quote " and é']);
    expect(writeJson(out)).toBe(JSON.stringify(value, null, 2) + "\n");
  });

  it("keeps the given key order, even for integer-like keys", () => {
    expect(writeJson(new JsonObjectOut([["b", 1], ["10", 2], ["1", 3]]))).toBe('{\n  "b": 1,\n  "10": 2,\n  "1": 3\n}\n');
  });

  it("omits entries whose value is undefined", () => {
    expect(writeJson(obj(["a", 1], ["b", undefined], ["c", 2]))).toBe('{\n  "a": 1,\n  "c": 2\n}\n');
  });

  it("uses LF line endings only", () => {
    expect(writeJson(obj(["a", [1, 2]]))).not.toContain("\r");
  });
});
