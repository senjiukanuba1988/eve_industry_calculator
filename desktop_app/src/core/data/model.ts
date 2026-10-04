// The contents of the data folder, one type per file, as described in
// design/data-files.md. Everything is referred to by name; there are no IDs.
// Maps keyed by item name are Maps rather than objects, so that no item name
// (such as "__proto__") can collide with an object property.

export const DATA_FILES = ["manifest.json", "items.json", "recipes.json", "hangar.json", "plans.json"] as const;

export type DataFileName = (typeof DATA_FILES)[number];

/** Item name to a whole quantity of at least 1. Zero quantities are removed, never stored. */
export type Quantities = Map<string, number>;

/** ISO 8601 local time with UTC offset, to the second: "2026-10-04T16:32:05+02:00". */
export type Timestamp = string;

export interface Manifest {
  formatVersion: number;
  writtenBy: string;
}

export interface ItemCatalog {
  /** Category name to the names of the items in it. A category may be empty. */
  categories: Map<string, string[]>;
  uncategorised: string[];
}

export const RECIPE_TYPES = ["T1 Manufacturing", "T2 Manufacturing", "Reaction", "Planetary Industry"] as const;

export type RecipeType = (typeof RECIPE_TYPES)[number];

export interface Recipe {
  product: string;
  variant?: string;
  type: RecipeType;
  /** Units of the product one run yields. */
  output: number;
  notes?: string;
  /** Item name to quantity consumed per run. */
  inputs: Quantities;
}

export interface Hangar {
  /** General, unreserved stock. Reserved material lives on the plan holding it. */
  stock: Quantities;
}

export interface RecipeRef {
  product: string;
  variant?: string;
}

export type StepState = "started" | "done";

export type StockSource = "reserved" | "general";

/** A started or done build step, frozen as it was when it was started. */
export interface PlanStep {
  state: StepState;
  product: string;
  variant?: string;
  runs: number;
  inputsPerRun: Quantities;
  outputPerRun: number;
  takenFrom: StockSource;
  /** What was actually deducted after clamping at zero. Absent if done directly without deducting. */
  deducted?: Quantities;
  /** Shortfall recorded at start. Absent if none. */
  short?: Quantities;
  /** Absent if marked done directly without starting. */
  started?: Timestamp;
  /** Done steps only. */
  done?: Timestamp;
  /** Done steps only: how the output was split between the plan's pile and general stock. */
  addedToReserved?: number;
  addedToGeneral?: number;
  /** Output a revert from done could not remove because it had been spent. */
  notRemoved?: number;
}

export interface Plan {
  name: string;
  target: RecipeRef;
  runs: number;
  created: Timestamp;
  /** Present only on a completed plan; its presence is the completed status. */
  completed?: Timestamp;
  /** Intermediate product to chosen variant label. Empty when there are no choices. */
  variantChoices: Map<string, string>;
  /** The plan's reserved pile, present only while it is reserved. May be empty while reserved. */
  reserved?: Quantities;
  /** Started and done steps only, in the order they were started or done. */
  steps: PlanStep[];
}

export interface AppData {
  manifest: Manifest;
  items: ItemCatalog;
  recipes: Recipe[];
  hangar: Hangar;
  plans: Plan[];
}
