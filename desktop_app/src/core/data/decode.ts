// Turns parsed JSON into the data model, checking everything that can be checked within
// one file: structure, field types, unknown keys, quantities, names and times. Problems
// are collected rather than stopping at the first, and every visited value's line is
// recorded by path so that the cross-file checks can point at lines too.

import type { DataError } from "./dataError";
import type { JsonNode } from "./jsonParse";
import {
  RECIPE_TYPES,
  type DataFileName,
  type Hangar,
  type ItemCatalog,
  type Manifest,
  type Plan,
  type PlanStep,
  type Quantities,
  type Recipe,
  type RecipeRef,
  type RecipeType,
  type StepState,
  type StockSource,
} from "./model";
import { isTimestamp } from "./timestamp";

/**
 * Every object shape in the data files, with its required and optional keys. Since unknown
 * keys are rejected, this is the complete list of fields the current format can contain;
 * the format-change guard test snapshots it.
 */
export const FIELDS = {
  manifest: { required: ["formatVersion", "writtenBy"], optional: ["note"] },
  items: { required: ["categories", "uncategorised"], optional: [] },
  recipesFile: { required: ["recipes"], optional: [] },
  recipe: { required: ["product", "type", "output", "inputs"], optional: ["variant", "notes"] },
  hangar: { required: ["stock"], optional: [] },
  plansFile: { required: ["plans"], optional: [] },
  plan: { required: ["name", "target", "runs", "created", "steps"], optional: ["completed", "variantChoices", "reserved"] },
  target: { required: ["product"], optional: ["variant"] },
  step: {
    required: ["state", "product", "runs", "inputsPerRun", "outputPerRun", "takenFrom"],
    optional: ["variant", "deducted", "short", "started", "done", "addedToReserved", "addedToGeneral", "notRemoved"],
  },
} as const satisfies Record<string, { required: readonly string[]; optional: readonly string[] }>;

/** Every fixed set of text values the current format allows. */
export const ENUMS = {
  recipeType: RECIPE_TYPES,
  stepState: ["started", "done"],
  stockSource: ["reserved", "general"],
} as const satisfies Record<string, readonly string[]>;

type Shape = (typeof FIELDS)[keyof typeof FIELDS];

/** Path to line, for every value and map entry the decoder visited. */
export type LineIndex = Map<string, number>;

export interface Decoded<T> {
  value: T | undefined;
  errors: DataError[];
  lines: LineIndex;
}

const WHOLE_NUMBER = /^(0|[1-9][0-9]*)$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Path of a field or list element: `.key` for plain keys, `["key"]` for anything else. */
export function childPath(path: string, key: string | number): string {
  if (typeof key === "number") {
    return `${path}[${key}]`;
  }
  if (IDENTIFIER.test(key)) {
    return path === "" ? key : `${path}.${key}`;
  }
  return entryPath(path, key);
}

/** Path of an entry in a map keyed by name, always in brackets: `stock["Tritanium"]`. */
export function entryPath(path: string, name: string): string {
  return `${path}[${JSON.stringify(name)}]`;
}

function describe(node: JsonNode): string {
  switch (node.kind) {
    case "object":
      return "an object";
    case "array":
      return "a list";
    case "string":
      return `the text ${JSON.stringify(node.value)}`;
    case "number":
      return `the number ${node.raw}`;
    case "boolean":
      return String(node.value);
    case "null":
      return "null";
  }
}

class FileDecoder {
  readonly errors: DataError[] = [];
  readonly lines: LineIndex = new Map();

  constructor(private readonly file: DataFileName) {}

  fail(line: number, path: string, message: string): undefined {
    this.errors.push({ file: this.file, line, path: path || undefined, message });
    return undefined;
  }

  private visit(node: JsonNode, path: string): void {
    this.lines.set(path, node.line);
  }

  private mismatch(node: JsonNode, path: string, expected: string): undefined {
    const at = path === "" ? "" : `${path}: `;
    return this.fail(node.line, path, `${at}expected ${expected}, found ${describe(node)}`);
  }

  /**
   * An object with a fixed set of keys. Unknown keys and missing required keys are
   * reported; the known keys that are present are returned.
   */
  object(node: JsonNode, path: string, { required, optional }: Shape): Map<string, JsonNode> | undefined {
    this.visit(node, path);
    if (node.kind !== "object") {
      return this.mismatch(node, path, "an object");
    }
    const known: readonly string[] = [...required, ...optional];
    const fields = new Map<string, JsonNode>();
    let ok = true;
    for (const entry of node.entries) {
      if (!known.includes(entry.key)) {
        ok = false;
        this.fail(
          entry.keyLine,
          childPath(path, entry.key),
          `unknown key ${JSON.stringify(entry.key)}${path ? ` in ${path}` : ""}; expected one of: ${known.join(", ")}`,
        );
      } else {
        fields.set(entry.key, entry.value);
      }
    }
    for (const key of required) {
      if (!fields.has(key)) {
        ok = false;
        this.fail(node.line, path, `${path ? `${path}: ` : ""}missing ${JSON.stringify(key)}`);
      }
    }
    return ok ? fields : undefined;
  }

  /** The entries of an object used as a map, keyed by name. */
  map<V>(node: JsonNode, path: string, keyKind: string, decodeValue: (value: JsonNode, path: string) => V | undefined): Map<string, V> | undefined {
    this.visit(node, path);
    if (node.kind !== "object") {
      return this.mismatch(node, path, "an object");
    }
    const result = new Map<string, V>();
    let ok = true;
    for (const entry of node.entries) {
      const at = entryPath(path, entry.key);
      this.lines.set(at, entry.keyLine);
      const nameOk = this.checkName(entry.key, entry.keyLine, at, keyKind);
      const value = decodeValue(entry.value, at);
      if (!nameOk || value === undefined) {
        ok = false;
      } else {
        result.set(entry.key, value);
      }
    }
    return ok ? result : undefined;
  }

  list<V>(node: JsonNode, path: string, decodeItem: (item: JsonNode, path: string) => V | undefined): V[] | undefined {
    this.visit(node, path);
    if (node.kind !== "array") {
      return this.mismatch(node, path, "a list");
    }
    const result: V[] = [];
    let ok = true;
    node.items.forEach((item, i) => {
      const value = decodeItem(item, childPath(path, i));
      if (value === undefined) {
        ok = false;
      } else {
        result.push(value);
      }
    });
    return ok ? result : undefined;
  }

  text(node: JsonNode, path: string): string | undefined {
    this.visit(node, path);
    if (node.kind !== "string") {
      return this.mismatch(node, path, "text in double quotes");
    }
    return node.value;
  }

  /** A name or label: non-empty, without spaces at either end. */
  name(node: JsonNode, path: string, kind: string): string | undefined {
    const value = this.text(node, path);
    if (value === undefined || !this.checkName(value, node.line, path, kind)) {
      return undefined;
    }
    return value;
  }

  private checkName(value: string, line: number, path: string, kind: string): boolean {
    if (value.trim() === "") {
      this.fail(line, path, `${path}: expected ${kind}, found empty text`);
      return false;
    }
    if (value.trim() !== value) {
      this.fail(line, path, `${path}: ${kind} ${JSON.stringify(value)} has spaces at the start or end; remove them`);
      return false;
    }
    return true;
  }

  wholeNumber(node: JsonNode, path: string, min: number): number | undefined {
    this.visit(node, path);
    if (node.kind !== "number" || !WHOLE_NUMBER.test(node.raw) || !Number.isSafeInteger(node.value) || node.value < min) {
      return this.mismatch(node, path, `a whole number of at least ${min}`);
    }
    return node.value;
  }

  quantities(node: JsonNode, path: string): Quantities | undefined {
    return this.map(node, path, "an item name", (value, p) => this.wholeNumber(value, p, 1));
  }

  oneOf<T extends string>(node: JsonNode, path: string, options: readonly T[]): T | undefined {
    this.visit(node, path);
    if (node.kind !== "string" || !(options as readonly string[]).includes(node.value)) {
      return this.mismatch(node, path, `one of ${options.map((o) => JSON.stringify(o)).join(", ")}`);
    }
    return node.value as T;
  }

  timestamp(node: JsonNode, path: string): string | undefined {
    this.visit(node, path);
    if (node.kind !== "string" || !isTimestamp(node.value)) {
      return this.mismatch(node, path, 'a date and time such as "2026-10-04T16:32:05+02:00"');
    }
    return node.value;
  }

  result<T>(value: NoInfer<T> | undefined): Decoded<T> {
    return { value: this.errors.length === 0 ? value : undefined, errors: this.errors, lines: this.lines };
  }
}

/** Decodes an optional field: undefined if absent, `invalid` if present but broken. */
function optional<T>(
  fields: Map<string, JsonNode>,
  key: string,
  decode: (node: JsonNode) => T | undefined,
): { value?: T; invalid?: true } {
  const node = fields.get(key);
  if (node === undefined) {
    return {};
  }
  const value = decode(node);
  return value === undefined ? { invalid: true } : { value };
}

export function decodeManifest(root: JsonNode): Decoded<Manifest> {
  const d = new FileDecoder("manifest.json");
  const f = d.object(root, "", FIELDS.manifest);
  if (!f) {
    return d.result(undefined);
  }
  const formatVersion = d.wholeNumber(f.get("formatVersion")!, "formatVersion", 1);
  const writtenBy = d.name(f.get("writtenBy")!, "writtenBy", "a version number");
  const note = optional(f, "note", (n) => d.text(n, "note"));
  if (formatVersion === undefined || writtenBy === undefined || note.invalid) {
    return d.result(undefined);
  }
  return d.result({ formatVersion, writtenBy });
}

export function decodeItems(root: JsonNode): Decoded<ItemCatalog> {
  const d = new FileDecoder("items.json");
  const f = d.object(root, "", FIELDS.items);
  if (!f) {
    return d.result(undefined);
  }
  const itemList = (node: JsonNode, path: string) => d.list(node, path, (item, p) => d.name(item, p, "an item name"));
  const categories = d.map(f.get("categories")!, "categories", "a category name", itemList);
  const uncategorised = itemList(f.get("uncategorised")!, "uncategorised");
  if (!categories || !uncategorised) {
    return d.result(undefined);
  }
  return d.result({ categories, uncategorised });
}

export function decodeRecipes(root: JsonNode): Decoded<Recipe[]> {
  const d = new FileDecoder("recipes.json");
  const f = d.object(root, "", FIELDS.recipesFile);
  if (!f) {
    return d.result(undefined);
  }
  const recipes = d.list(f.get("recipes")!, "recipes", (node, path): Recipe | undefined => {
    const r = d.object(node, path, FIELDS.recipe);
    if (!r) {
      return undefined;
    }
    const product = d.name(r.get("product")!, childPath(path, "product"), "an item name");
    const variant = optional(r, "variant", (n) => d.name(n, childPath(path, "variant"), "a variant label"));
    const type = d.oneOf<RecipeType>(r.get("type")!, childPath(path, "type"), ENUMS.recipeType);
    const output = d.wholeNumber(r.get("output")!, childPath(path, "output"), 1);
    const notes = optional(r, "notes", (n) => d.text(n, childPath(path, "notes")));
    const inputs = d.quantities(r.get("inputs")!, childPath(path, "inputs"));
    if (product === undefined || variant.invalid || !type || output === undefined || notes.invalid || !inputs) {
      return undefined;
    }
    return { product, variant: variant.value, type, output, notes: notes.value, inputs };
  });
  return d.result(recipes);
}

export function decodeHangar(root: JsonNode): Decoded<Hangar> {
  const d = new FileDecoder("hangar.json");
  const f = d.object(root, "", FIELDS.hangar);
  const stock = f && d.quantities(f.get("stock")!, "stock");
  return d.result(stock && { stock });
}

export function decodePlans(root: JsonNode): Decoded<Plan[]> {
  const d = new FileDecoder("plans.json");
  const f = d.object(root, "", FIELDS.plansFile);
  if (!f) {
    return d.result(undefined);
  }
  const plans = d.list(f.get("plans")!, "plans", (node, path) => decodePlan(d, node, path));
  return d.result(plans);
}

function decodePlan(d: FileDecoder, node: JsonNode, path: string): Plan | undefined {
  const p = d.object(node, path, FIELDS.plan);
  if (!p) {
    return undefined;
  }
  const at = (key: string) => childPath(path, key);
  const name = decodePlanName(d, p.get("name")!, at("name"));
  const target = decodeRecipeRef(d, p.get("target")!, at("target"));
  const runs = d.wholeNumber(p.get("runs")!, at("runs"), 1);
  const created = d.timestamp(p.get("created")!, at("created"));
  const completed = optional(p, "completed", (n) => d.timestamp(n, at("completed")));
  const variantChoices = optional(p, "variantChoices", (n) =>
    d.map(n, at("variantChoices"), "a product name", (v, vp) => d.name(v, vp, "a variant label")),
  );
  const reserved = optional(p, "reserved", (n) => d.quantities(n, at("reserved")));
  const steps = d.list(p.get("steps")!, at("steps"), (s, sp) => decodeStep(d, s, sp));
  if (
    name === undefined ||
    !target ||
    runs === undefined ||
    created === undefined ||
    completed.invalid ||
    variantChoices.invalid ||
    reserved.invalid ||
    !steps
  ) {
    return undefined;
  }
  if (completed.value !== undefined && reserved.value !== undefined) {
    return d.fail(p.get("reserved")!.line, at("reserved"), `${at("reserved")}: a completed plan cannot hold a reservation; remove "reserved" or "completed"`);
  }
  return {
    name,
    target,
    runs,
    created,
    completed: completed.value,
    variantChoices: variantChoices.value ?? new Map(),
    reserved: reserved.value,
    steps,
  };
}

function decodePlanName(d: FileDecoder, node: JsonNode, path: string): string | undefined {
  const name = d.text(node, path);
  if (name !== undefined && name.trim() === "") {
    return d.fail(node.line, path, `${path}: expected a plan name, found empty text`);
  }
  return name;
}

function decodeRecipeRef(d: FileDecoder, node: JsonNode, path: string): RecipeRef | undefined {
  const t = d.object(node, path, FIELDS.target);
  if (!t) {
    return undefined;
  }
  const product = d.name(t.get("product")!, childPath(path, "product"), "an item name");
  const variant = optional(t, "variant", (n) => d.name(n, childPath(path, "variant"), "a variant label"));
  if (product === undefined || variant.invalid) {
    return undefined;
  }
  return { product, variant: variant.value };
}


/** Fields a step must have, and must not have, in each state. */
const STEP_STATE_RULES: Record<StepState, { needs: string[]; forbids: string[] }> = {
  started: { needs: ["started", "deducted"], forbids: ["done", "addedToReserved", "addedToGeneral"] },
  done: { needs: ["done", "addedToReserved", "addedToGeneral"], forbids: [] },
};

function decodeStep(d: FileDecoder, node: JsonNode, path: string): PlanStep | undefined {
  const s = d.object(node, path, FIELDS.step);
  if (!s) {
    return undefined;
  }
  const at = (key: string) => childPath(path, key);
  const state = d.oneOf<StepState>(s.get("state")!, at("state"), ENUMS.stepState);
  const product = d.name(s.get("product")!, at("product"), "an item name");
  const variant = optional(s, "variant", (n) => d.name(n, at("variant"), "a variant label"));
  const runs = d.wholeNumber(s.get("runs")!, at("runs"), 1);
  const inputsPerRun = d.quantities(s.get("inputsPerRun")!, at("inputsPerRun"));
  const outputPerRun = d.wholeNumber(s.get("outputPerRun")!, at("outputPerRun"), 1);
  const takenFrom = d.oneOf<StockSource>(s.get("takenFrom")!, at("takenFrom"), ENUMS.stockSource);
  const deducted = optional(s, "deducted", (n) => d.quantities(n, at("deducted")));
  const short = optional(s, "short", (n) => d.quantities(n, at("short")));
  const started = optional(s, "started", (n) => d.timestamp(n, at("started")));
  const done = optional(s, "done", (n) => d.timestamp(n, at("done")));
  const addedToReserved = optional(s, "addedToReserved", (n) => d.wholeNumber(n, at("addedToReserved"), 0));
  const addedToGeneral = optional(s, "addedToGeneral", (n) => d.wholeNumber(n, at("addedToGeneral"), 0));
  const notRemoved = optional(s, "notRemoved", (n) => d.wholeNumber(n, at("notRemoved"), 1));
  if (
    !state ||
    product === undefined ||
    variant.invalid ||
    runs === undefined ||
    !inputsPerRun ||
    outputPerRun === undefined ||
    !takenFrom ||
    deducted.invalid ||
    short.invalid ||
    started.invalid ||
    done.invalid ||
    addedToReserved.invalid ||
    addedToGeneral.invalid ||
    notRemoved.invalid
  ) {
    return undefined;
  }
  const rules = STEP_STATE_RULES[state];
  let ok = true;
  for (const key of rules.needs) {
    if (!s.has(key)) {
      ok = false;
      d.fail(node.line, path, `${path}: a ${state} step needs ${JSON.stringify(key)}`);
    }
  }
  for (const key of rules.forbids) {
    const field = s.get(key);
    if (field) {
      ok = false;
      d.fail(field.line, at(key), `${path}: a ${state} step cannot have ${JSON.stringify(key)}`);
    }
  }
  if (!ok) {
    return undefined;
  }
  return {
    state,
    product,
    variant: variant.value,
    runs,
    inputsPerRun,
    outputPerRun,
    takenFrom,
    deducted: deducted.value,
    short: short.value,
    started: started.value,
    done: done.value,
    addedToReserved: addedToReserved.value,
    addedToGeneral: addedToGeneral.value,
    notRemoved: notRemoved.value,
  };
}
