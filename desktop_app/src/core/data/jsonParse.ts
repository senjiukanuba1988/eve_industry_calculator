// A strict JSON parser that keeps the line of every value and object key, and rejects
// repeated keys. JSON.parse cannot do either: it has no positions, and it lets the last
// copy of a repeated key win silently, which would lose a hand-edited line without a word.

export type JsonNode =
  | { kind: "object"; line: number; entries: JsonEntry[] }
  | { kind: "array"; line: number; items: JsonNode[] }
  | { kind: "string"; line: number; value: string }
  | { kind: "number"; line: number; value: number; raw: string }
  | { kind: "boolean"; line: number; value: boolean }
  | { kind: "null"; line: number };

export interface JsonEntry {
  key: string;
  keyLine: number;
  value: JsonNode;
}

export interface JsonProblem {
  line: number;
  message: string;
}

export type JsonParseResult = { ok: true; value: JsonNode } | { ok: false; problems: JsonProblem[] };

class SyntaxProblem extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message);
  }
}

const ESCAPES: Record<string, string> = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

/**
 * Parses JSON text. A syntax error is reported on its own, since nothing after it can be
 * read reliably; repeated keys are all reported, each with the line of the earlier copy.
 * A leading byte order mark and CRLF line endings are accepted.
 */
export function parseJson(text: string): JsonParseResult {
  const parser = new Parser(text.startsWith("\uFEFF") ? text.slice(1) : text);
  try {
    const value = parser.parseDocument();
    if (parser.repeatedKeys.length > 0) {
      return { ok: false, problems: parser.repeatedKeys };
    }
    return { ok: true, value };
  } catch (e) {
    if (e instanceof SyntaxProblem) {
      return { ok: false, problems: [{ line: e.line, message: e.message }] };
    }
    throw e;
  }
}

class Parser {
  private pos = 0;
  private line = 1;
  readonly repeatedKeys: JsonProblem[] = [];

  constructor(private readonly text: string) {}

  parseDocument(): JsonNode {
    this.skipWhitespace();
    if (this.pos >= this.text.length) {
      throw new SyntaxProblem(this.line, "the file is empty; expected a JSON object");
    }
    const value = this.parseValue();
    this.skipWhitespace();
    if (this.pos < this.text.length) {
      throw this.unexpected("the end of the file");
    }
    return value;
  }

  private parseValue(): JsonNode {
    const ch = this.text[this.pos];
    const line = this.line;
    switch (ch) {
      case "{":
        return this.parseObject();
      case "[":
        return this.parseArray();
      case '"':
        return { kind: "string", line, value: this.parseString() };
      case "t":
        this.expectWord("true");
        return { kind: "boolean", line, value: true };
      case "f":
        this.expectWord("false");
        return { kind: "boolean", line, value: false };
      case "n":
        this.expectWord("null");
        return { kind: "null", line };
      default:
        if (ch === "-" || (ch !== undefined && ch >= "0" && ch <= "9")) {
          return this.parseNumber();
        }
        throw this.unexpected("a value");
    }
  }

  private parseObject(): JsonNode {
    const line = this.line;
    this.pos++; // {
    const entries: JsonEntry[] = [];
    const seen = new Map<string, number>();
    this.skipWhitespace();
    if (this.text[this.pos] === "}") {
      this.pos++;
      return { kind: "object", line, entries };
    }
    for (;;) {
      this.skipWhitespace();
      if (this.text[this.pos] !== '"') {
        throw this.unexpected('a key in double quotes');
      }
      const keyLine = this.line;
      const key = this.parseString();
      const firstLine = seen.get(key);
      if (firstLine !== undefined) {
        this.repeatedKeys.push({
          line: keyLine,
          message: `"${key}" appears twice in the same object (first on line ${firstLine}); each key may appear only once`,
        });
      } else {
        seen.set(key, keyLine);
      }
      this.skipWhitespace();
      if (this.text[this.pos] !== ":") {
        throw this.unexpected('":" after the key');
      }
      this.pos++;
      this.skipWhitespace();
      entries.push({ key, keyLine, value: this.parseValue() });
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ",") {
        this.pos++;
        continue;
      }
      if (next === "}") {
        this.pos++;
        return { kind: "object", line, entries };
      }
      throw this.unexpected('"," or "}"');
    }
  }

  private parseArray(): JsonNode {
    const line = this.line;
    this.pos++; // [
    const items: JsonNode[] = [];
    this.skipWhitespace();
    if (this.text[this.pos] === "]") {
      this.pos++;
      return { kind: "array", line, items };
    }
    for (;;) {
      this.skipWhitespace();
      items.push(this.parseValue());
      this.skipWhitespace();
      const next = this.text[this.pos];
      if (next === ",") {
        this.pos++;
        continue;
      }
      if (next === "]") {
        this.pos++;
        return { kind: "array", line, items };
      }
      throw this.unexpected('"," or "]"');
    }
  }

  private parseString(): string {
    this.pos++; // opening quote
    let result = "";
    for (;;) {
      const ch = this.text[this.pos];
      if (ch === undefined || ch === "\n" || ch === "\r") {
        throw new SyntaxProblem(this.line, "a text value is missing its closing double quote");
      }
      if (ch === '"') {
        this.pos++;
        return result;
      }
      if (ch === "\\") {
        const esc = this.text[this.pos + 1];
        if (esc === "u") {
          const hex = this.text.slice(this.pos + 2, this.pos + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            throw new SyntaxProblem(this.line, `invalid escape "\\u${hex}"; expected four hex digits after \\u`);
          }
          result += String.fromCharCode(parseInt(hex, 16));
          this.pos += 6;
          continue;
        }
        const decoded = esc === undefined ? undefined : ESCAPES[esc];
        if (decoded === undefined) {
          throw new SyntaxProblem(this.line, `invalid escape "\\${esc ?? ""}" in a text value`);
        }
        result += decoded;
        this.pos += 2;
        continue;
      }
      if (ch < " ") {
        throw new SyntaxProblem(this.line, "a text value contains a control character; use an escape such as \\t");
      }
      result += ch;
      this.pos++;
    }
  }

  private parseNumber(): JsonNode {
    const line = this.line;
    const match = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(this.text.slice(this.pos));
    if (!match) {
      throw this.unexpected("a number");
    }
    const raw = match[0];
    this.pos += raw.length;
    return { kind: "number", line, value: Number(raw), raw };
  }

  private expectWord(word: string): void {
    if (this.text.startsWith(word, this.pos)) {
      this.pos += word.length;
    } else {
      throw this.unexpected("a value");
    }
  }

  private skipWhitespace(): void {
    for (;;) {
      const ch = this.text[this.pos];
      if (ch === "\n") {
        this.line++;
      } else if (ch !== " " && ch !== "\t" && ch !== "\r") {
        return;
      }
      this.pos++;
    }
  }

  private unexpected(expected: string): SyntaxProblem {
    const ch = this.text[this.pos];
    const found = ch === undefined ? "the end of the file" : `"${ch}"`;
    return new SyntaxProblem(this.line, `expected ${expected}, found ${found}`);
  }
}
