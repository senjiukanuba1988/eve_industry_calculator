import { parseJson, type JsonNode } from "./jsonParse";

function parsed(text: string): JsonNode {
  const result = parseJson(text);
  if (!result.ok) {
    throw new Error(result.problems.map((p) => `${p.line}: ${p.message}`).join("\n"));
  }
  return result.value;
}

function problems(text: string) {
  const result = parseJson(text);
  if (result.ok) {
    throw new Error("expected the text to be rejected");
  }
  return result.problems;
}

describe("parseJson", () => {
  it("reads every kind of value with its line", () => {
    const root = parsed('{\n  "a": "x",\n  "b": [1, -2.5e3, true, false, null],\n  "c": {}\n}\n');
    expect(root).toEqual({
      kind: "object",
      line: 1,
      entries: [
        { key: "a", keyLine: 2, value: { kind: "string", line: 2, value: "x" } },
        {
          key: "b",
          keyLine: 3,
          value: {
            kind: "array",
            line: 3,
            items: [
              { kind: "number", line: 3, value: 1, raw: "1" },
              { kind: "number", line: 3, value: -2500, raw: "-2.5e3" },
              { kind: "boolean", line: 3, value: true },
              { kind: "boolean", line: 3, value: false },
              { kind: "null", line: 3 },
            ],
          },
        },
        { key: "c", keyLine: 4, value: { kind: "object", line: 4, entries: [] } },
      ],
    });
  });

  it("decodes escapes", () => {
    const root = parsed('{"s": "a\\"b\\\\c\\/d\\n\\t\\u00e9"}');
    expect(root.kind === "object" && root.entries[0]!.value).toEqual({ kind: "string", line: 1, value: 'a"b\\c/d\n\té' });
  });

  it("counts CRLF line endings as one line each", () => {
    const root = parsed('{\r\n  "a": 1,\r\n  "b": 2\r\n}\r\n');
    expect(root.kind === "object" && root.entries.map((e) => e.keyLine)).toEqual([2, 3]);
  });

  it("accepts a byte order mark", () => {
    expect(parsed('\uFEFF{"a": 1}').kind).toBe("object");
  });

  it("reports every repeated key with the line of the first copy", () => {
    expect(problems('{\n  "inputs": {\n    "Morphite": 1,\n    "Robotics": 1,\n    "Morphite": 2\n  },\n  "inputs": {}\n}')).toEqual([
      { line: 5, message: '"Morphite" appears twice in the same object (first on line 3); each key may appear only once' },
      { line: 7, message: '"inputs" appears twice in the same object (first on line 2); each key may appear only once' },
    ]);
  });

  it("allows the same key in different objects", () => {
    expect(parseJson('[{"a": 1}, {"a": 2}]').ok).toBe(true);
  });

  it.each([
    ["a missing comma", '{\n  "a": 1\n  "b": 2\n}', 3, 'expected "," or "}", found """'],
    ["a trailing comma", '{\n  "a": 1,\n}', 3, 'expected a key in double quotes, found "}"'],
    ["a trailing comma in a list", '[\n  1,\n]', 3, 'expected a value, found "]"'],
    ["a missing colon", '{\n  "a" 1\n}', 2, 'expected ":" after the key, found "1"'],
    ["an unterminated text", '{\n  "a": "abc\n}', 2, "a text value is missing its closing double quote"],
    ["a single-quoted text", "{\n  'a': 1\n}", 2, "expected a key in double quotes, found \"'\""],
    ["a misspelt literal", '{\n  "a": tru\n}', 2, 'expected a value, found "t"'],
    ["a number with a thousands separator", '{\n  "a": 296,949\n}', 2, 'expected a key in double quotes, found "9"'],
    ["a leading plus", '{\n  "a": +1\n}', 2, 'expected a value, found "+"'],
    ["an invalid escape", '{\n  "a": "\\x"\n}', 2, 'invalid escape "\\x" in a text value'],
    ["text after the end", '{}\n{}', 2, 'expected the end of the file, found "{"'],
    ["a cut-off file", '{\n  "a": [1,', 2, "expected a value, found the end of the file"],
    ["an empty file", "  \n", 2, "the file is empty; expected a JSON object"],
  ])("rejects %s with its line", (_, text, line, message) => {
    expect(problems(text)).toEqual([{ line, message }]);
  });
});
