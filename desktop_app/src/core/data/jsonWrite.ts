// Pretty-prints JSON in the one canonical layout of the data files: two-space indentation,
// one key or element per line, LF endings, trailing newline. Objects are written from an
// explicit entry list, because JavaScript objects move integer-like keys (an item named
// "1", say) to the front and so cannot be trusted to keep the order we put keys in.

export type JsonOut = string | number | boolean | JsonOut[] | JsonObjectOut;

export class JsonObjectOut {
  constructor(readonly entries: ReadonlyArray<readonly [string, JsonOut]>) {}
}

/** Builds an object, dropping entries whose value is undefined (optional fields are omitted). */
export function obj(...entries: Array<readonly [string, JsonOut | undefined]>): JsonObjectOut {
  return new JsonObjectOut(entries.filter((e): e is readonly [string, JsonOut] => e[1] !== undefined));
}

export function writeJson(value: JsonOut): string {
  return write(value, 0) + "\n";
}

function write(value: JsonOut, depth: number): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const inner = "  ".repeat(depth + 1);
  const outer = "  ".repeat(depth);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    return `[\n${value.map((v) => inner + write(v, depth + 1)).join(",\n")}\n${outer}]`;
  }
  if (value.entries.length === 0) {
    return "{}";
  }
  const lines = value.entries.map(([k, v]) => `${inner}${JSON.stringify(k)}: ${write(v, depth + 1)}`);
  return `{\n${lines.join(",\n")}\n${outer}}`;
}
