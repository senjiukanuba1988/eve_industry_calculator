// The calculation engine (material-calculation spec): from a target recipe and a number of
// runs to the material to acquire and the jobs to run, in order.
//
// Items are handled in dependency order, every item only once all of its consumers have
// been, so its total demand is known before anything is made of it. That gives, for free:
// one batch shared by several consumers, leftover below one run's output, and netting
// against available material at every tier before anything below it is expanded.

import type { PlanStep, Quantities, Recipe, RecipeRef } from "../data/model";
import { compareNames } from "../data/names";

export interface CalculationInput {
  recipes: readonly Recipe[];
  target: RecipeRef;
  runs: number;
  /** The material the calculation may draw on: general stock, or a reserved plan's own pile. */
  available: Quantities;
  /** Intermediate product to the variant label the plan chose for it. */
  variantChoices: ReadonlyMap<string, string>;
  /** The plan's started and done steps. */
  steps: readonly PlanStep[];
}

/** A job to run: new (not started), or one already started, whose recorded figures are fixed. */
export interface BuildEntry {
  product: string;
  /** The recipe it runs; for a started step, the recipe as recorded when it was started. */
  recipe: RecipeRef;
  runs: number;
  /** Total output: runs times output per run. */
  output: number;
  /** Output beyond what the plan needs. For a new entry, always less than one run's output. */
  leftover: number;
  /** Total inputs: runs times inputs per run. */
  inputs: Quantities;
  state: "notStarted" | "started";
  /** For a started entry: its index in the plan's steps. */
  step?: number;
  /** The step producing the plan's target. */
  isTarget: boolean;
}

/** A base material: an item no recipe produces. Listed even when fully covered. */
export interface BaseMaterial {
  item: string;
  /** Total demand for it across the whole tree. */
  needed: number;
  /** Covered by available material. */
  covered: number;
  /** Still to acquire: needed minus covered. */
  toAcquire: number;
}

/** An intermediate with several recipes and no valid choice: the user has to pick one. */
export interface ChoiceNeeded {
  product: string;
  /** The labels to choose from. */
  variants: string[];
  /** The label chosen earlier that no longer names a recipe, if that is why. */
  invalidChoice?: string;
  /** How much of it is still to be made once available material is used. */
  stillNeeded: number;
}

/**
 * Why an item's numbers are what they are ("The calculation explains itself"). The parts
 * always add up: totalDemand = fromAvailable + onItsWay + remaining, and for a build,
 * produced = runs x outputPerRun = remaining + leftover.
 */
export interface ItemTrace {
  item: string;
  /** What happens to the part not covered: built, acquired, waiting for a variant choice; or the plan's target. */
  how: "build" | "acquire" | "choice" | "target";
  /** Which parts of the tree asked for it: each consuming product and how much it takes, sorted by name. Empty for the target. */
  demandFrom: Array<{ consumer: string; quantity: number }>;
  /** For the target: the runs asked for times the output per run. */
  totalDemand: number;
  /** Covered by available material. Always 0 for the target, which is never netted. */
  fromAvailable: number;
  /** Covered by output of started steps. */
  onItsWay: number;
  /** Still to make, acquire or choose for. */
  remaining: number;
  /** For a build or the target: */
  outputPerRun?: number;
  runs?: number;
  produced?: number;
  leftover?: number;
}

export type CalculationResult =
  | {
      ok: true;
      /** Base materials still short, sorted by name. */
      acquire: Array<{ item: string; quantity: number }>;
      /** In build order: every entry's inputs are base materials or made by an entry before it; the target last. */
      builds: BuildEntry[];
      /** Every base material the tree reaches, sorted by name. */
      baseMaterials: BaseMaterial[];
      /** How much of each item, intermediates included, the plan takes from available material. What a reservation moves. */
      fromAvailable: Quantities;
      /** Intermediates waiting for a variant choice; nothing below them is calculated until it is made. */
      choicesNeeded: ChoiceNeeded[];
      /** Every item the calculation reached with any demand, the target included. */
      trace: Map<string, ItemTrace>;
    }
  | { ok: false; reason: "targetMissing" };

type Resolution = { kind: "base" } | { kind: "recipe"; recipe: Recipe } | { kind: "choice"; variants: string[]; invalidChoice?: string };

export function calculate(input: CalculationInput): CalculationResult {
  const byProduct = new Map<string, Recipe[]>();
  for (const r of input.recipes) {
    byProduct.set(r.product, [...(byProduct.get(r.product) ?? []), r]);
  }
  const targetRecipe = byProduct.get(input.target.product)?.find((r) => r.variant === input.target.variant);
  if (!targetRecipe) {
    return { ok: false, reason: "targetMissing" };
  }
  const target = targetRecipe.product;

  const resolve = (product: string): Resolution => {
    if (product === target) {
      return { kind: "recipe", recipe: targetRecipe };
    }
    const candidates = byProduct.get(product) ?? [];
    if (candidates.length === 0) {
      return { kind: "base" };
    }
    const variants = candidates.map((r) => r.variant ?? "").sort(compareNames);
    const choice = input.variantChoices.get(product);
    if (choice !== undefined) {
      const chosen = candidates.find((r) => r.variant === choice);
      return chosen ? { kind: "recipe", recipe: chosen } : { kind: "choice", variants, invalidChoice: choice };
    }
    return candidates.length === 1 ? { kind: "recipe", recipe: candidates[0]! } : { kind: "choice", variants };
  };

  // The tree as the chosen recipes describe it: every item reachable from the target, in an
  // order where each item comes after all of its consumers, and each item's tier (0 for base
  // materials, one above its highest input otherwise).
  const resolutions = new Map<string, Resolution>();
  const tier = new Map<string, number>();
  const postOrder: string[] = [];
  const visit = (item: string) => {
    if (resolutions.has(item)) {
      return;
    }
    const resolution = resolve(item);
    resolutions.set(item, resolution);
    let height = 0;
    if (resolution.kind === "recipe") {
      for (const inputItem of resolution.recipe.inputs.keys()) {
        visit(inputItem);
        height = Math.max(height, tier.get(inputItem)! + 1);
      }
    }
    tier.set(item, height);
    postOrder.push(item);
  };
  visit(target);
  const consumersFirst = [...postOrder].reverse();

  // Started steps: their output is on its way, and they stay on the checklist as they are.
  const inFlight = new Map<string, number>();
  let targetRunsUnderway = 0;
  input.steps.forEach((s) => {
    if (s.product === target) {
      targetRunsUnderway += s.runs;
    } else if (s.state === "started") {
      inFlight.set(s.product, (inFlight.get(s.product) ?? 0) + s.runs * s.outputPerRun);
    }
  });

  const demand = new Map<string, number>();
  const demandFrom = new Map<string, Map<string, number>>();
  const addDemand = (recipe: Recipe, runs: number) => {
    for (const [item, perRun] of recipe.inputs) {
      demand.set(item, (demand.get(item) ?? 0) + perRun * runs);
      const from = demandFrom.get(item) ?? demandFrom.set(item, new Map()).get(item)!;
      from.set(recipe.product, (from.get(recipe.product) ?? 0) + perRun * runs);
    }
  };
  const trace = new Map<string, ItemTrace>();

  const builds: BuildEntry[] = [];
  const baseMaterials: BaseMaterial[] = [];
  const fromAvailable: Quantities = new Map();
  const choicesNeeded: ChoiceNeeded[] = [];
  /** How much of the output already on its way the plan needs, per product. */
  const inFlightUsed = new Map<string, number>();
  const newBuild = (recipe: Recipe, runs: number, needed: number, isTarget: boolean): BuildEntry => ({
    product: recipe.product,
    recipe: { product: recipe.product, variant: recipe.variant },
    runs,
    output: runs * recipe.output,
    leftover: runs * recipe.output - needed,
    inputs: new Map([...recipe.inputs].map(([item, perRun]) => [item, perRun * runs])),
    state: "notStarted",
    isTarget,
  });

  for (const item of consumersFirst) {
    const resolution = resolutions.get(item)!;
    if (item === target) {
      // Never netted against stock: asking for 5 means 5 more. Only runs already underway count.
      const runs = Math.max(0, input.runs - targetRunsUnderway);
      const output = targetRecipe.output;
      const onItsWay = Math.min(input.runs, targetRunsUnderway) * output;
      trace.set(item, {
        item,
        how: "target",
        demandFrom: [],
        totalDemand: input.runs * output,
        fromAvailable: 0,
        onItsWay,
        remaining: runs * output,
        outputPerRun: output,
        runs,
        produced: runs * output,
        leftover: 0,
      });
      if (runs > 0) {
        builds.push(newBuild(targetRecipe, runs, runs * targetRecipe.output, true));
        addDemand(targetRecipe, runs);
      }
      continue;
    }

    const needed = demand.get(item) ?? 0;
    if (needed === 0) {
      continue;
    }
    const covered = Math.min(needed, input.available.get(item) ?? 0);
    if (covered > 0) {
      fromAvailable.set(item, covered);
    }
    const onItsWay = Math.min(needed - covered, inFlight.get(item) ?? 0);
    inFlightUsed.set(item, onItsWay);
    const remaining = needed - covered - onItsWay;
    const sources = [...demandFrom.get(item)!]
      .map(([consumer, quantity]) => ({ consumer, quantity }))
      .sort((a, b) => compareNames(a.consumer, b.consumer));
    const traced: ItemTrace = {
      item,
      how: "acquire",
      demandFrom: sources,
      totalDemand: needed,
      fromAvailable: covered,
      onItsWay,
      remaining,
    };
    trace.set(item, traced);

    if (resolution.kind === "base") {
      baseMaterials.push({ item, needed, covered, toAcquire: remaining });
    } else if (resolution.kind === "choice") {
      traced.how = "choice";
      if (remaining > 0) {
        choicesNeeded.push({
          product: item,
          variants: resolution.variants,
          invalidChoice: resolution.invalidChoice,
          stillNeeded: remaining,
        });
      }
    } else {
      const output = resolution.recipe.output;
      const runs = Math.ceil(remaining / output);
      Object.assign(traced, { how: "build", outputPerRun: output, runs, produced: runs * output, leftover: runs * output - remaining });
      if (runs === 0) {
        continue;
      }
      builds.push(newBuild(resolution.recipe, runs, remaining, false));
      addDemand(resolution.recipe, runs);
    }
  }

  // Started entries sit with the new entries for the same product; one whose product the tree
  // no longer needs keeps its place just before the target. What the plan does not need of
  // their output is leftover, shown on the last one started for that product.
  const lastStarted = new Map<string, number>();
  input.steps.forEach((s, i) => s.state === "started" && lastStarted.set(s.product, i));
  const started: BuildEntry[] = [];
  input.steps.forEach((s, i) => {
    if (s.state !== "started") {
      return;
    }
    const isTarget = s.product === target;
    const surplus = isTarget ? 0 : (inFlight.get(s.product) ?? 0) - (inFlightUsed.get(s.product) ?? 0);
    started.push({
      product: s.product,
      recipe: { product: s.product, variant: s.variant },
      runs: s.runs,
      output: s.runs * s.outputPerRun,
      leftover: lastStarted.get(s.product) === i ? surplus : 0,
      inputs: new Map([...s.inputsPerRun].map(([item, perRun]) => [item, perRun * s.runs])),
      state: "started",
      step: i,
      isTarget,
    });
  });

  const maxTier = tier.get(target)!;
  const tierOf = (e: BuildEntry) => (e.isTarget ? maxTier + 1 : (tier.get(e.product) ?? maxTier));
  const ordered = [...started, ...builds].sort(
    (a, b) =>
      tierOf(a) - tierOf(b) ||
      compareNames(a.product, b.product) ||
      // Started before new for the same product; then in the order they were started.
      (a.state === b.state ? (a.step ?? 0) - (b.step ?? 0) : a.state === "started" ? -1 : 1),
  );

  baseMaterials.sort((a, b) => compareNames(a.item, b.item));
  choicesNeeded.sort((a, b) => compareNames(a.product, b.product));
  return {
    ok: true,
    acquire: baseMaterials.filter((m) => m.toAcquire > 0).map((m) => ({ item: m.item, quantity: m.toAcquire })),
    builds: ordered,
    baseMaterials,
    fromAvailable,
    choicesNeeded,
    trace,
  };
}
