// Working a plan's build steps (production-plans spec, "Starting a step consumes its inputs",
// "A started step is fixed in place", "A short hangar warns but never blocks", "Completing a
// step yields its output", "Step progress can be reverted" and "Finishing a plan"). Every
// function is one change, saved in one commit.

import type { AppData, Plan, PlanStep, Quantities, Recipe, StepState, Timestamp } from "../data/model";
import { refuse, type Refusal } from "../refusal";
import { addTo, calculatePlan, planAt, type PlanAt } from "./plans";

/** A build entry not yet started, as the screen showed it. Acting on it checks it still reads the same. */
export interface EntryRef {
  product: string;
  variant?: string;
  runs: number;
}

/** A started or done step, by its place in the plan's steps, guarded by what it is. */
export interface StepRef {
  index: number;
  product: string;
  state: StepState;
}

export type StepRefusal =
  | { kind: "planNotFound"; plan: string }
  | { kind: "planCompleted" }
  /** The checklist no longer has that entry with those runs: something changed since it was shown. */
  | { kind: "entryChanged"; product: string }
  | { kind: "stepNotFound"; product: string };

type Found<T> = T | Refusal<StepRefusal>;

function isRefused<T extends object>(outcome: T | Refusal<StepRefusal>): outcome is Refusal<StepRefusal> {
  return "refused" in outcome;
}

function openPlan(data: AppData, at: PlanAt): Found<{ plan: Plan }> {
  const plan = planAt(data, at);
  if (!plan) {
    return refuse({ kind: "planNotFound", plan: at.name });
  }
  if (plan.completed !== undefined) {
    return refuse({ kind: "planCompleted" });
  }
  return { plan };
}

/** The recipe behind a not-started entry, provided the plan still shows it exactly so. */
function findEntry(data: AppData, plan: Plan, entry: EntryRef): Found<{ recipe: Recipe }> {
  const result = calculatePlan(data, plan);
  const shown =
    result.ok &&
    result.builds.some((b) => b.state === "notStarted" && b.product === entry.product && b.recipe.variant === entry.variant && b.runs === entry.runs);
  const recipe = data.recipes.find((r) => r.product === entry.product && r.variant === entry.variant);
  if (!shown || !recipe) {
    return refuse({ kind: "entryChanged", product: entry.product });
  }
  return { recipe };
}

function findStep(plan: Plan, ref: StepRef): Found<{ step: PlanStep }> {
  const step = plan.steps[ref.index];
  if (!step || step.product !== ref.product || step.state !== ref.state) {
    return refuse({ kind: "stepNotFound", product: ref.product });
  }
  return { step };
}

const totalInputs = (recipe: Recipe, runs: number): Quantities => new Map([...recipe.inputs].map(([item, perRun]) => [item, perRun * runs]));

/** Where the plan's material is: its reserved pile if it is reserved, general stock otherwise. */
const sourceOf = (data: AppData, plan: Plan): Quantities => plan.reserved ?? data.hangar.stock;

/** What starting this entry would be short of, item by item. Empty when the material covers it. */
export function startShortfall(data: AppData, at: PlanAt, entry: EntryRef): Quantities | Refusal<StepRefusal> {
  const open = openPlan(data, at);
  if (isRefused(open)) {
    return open;
  }
  const found = findEntry(data, open.plan, entry);
  if (isRefused(found)) {
    return found;
  }
  return deduct(sourceOf(data, open.plan), totalInputs(found.recipe, entry.runs)).short;
}

/**
 * Marks an entry started: deducts its inputs from the reserved pile or general stock,
 * clamping at zero and recording any shortfall, and fixes the recipe's figures on the step.
 */
export function startStep(data: AppData, at: PlanAt, entry: EntryRef, now: Timestamp): AppData | Refusal<StepRefusal> {
  const open = openPlan(data, at);
  if (isRefused(open)) {
    return open;
  }
  const found = findEntry(data, open.plan, entry);
  if (isRefused(found)) {
    return found;
  }
  return withStarted(data, at.index, open.plan, found.recipe, entry.runs, now, true);
}

function withStarted(data: AppData, index: number, plan: Plan, recipe: Recipe, runs: number, now: Timestamp, deducting: boolean): AppData {
  const step: PlanStep = {
    state: "started",
    product: recipe.product,
    variant: recipe.variant,
    runs,
    inputsPerRun: new Map(recipe.inputs),
    outputPerRun: recipe.output,
    takenFrom: plan.reserved ? "reserved" : "general",
    started: now,
  };
  let next = data;
  let updated: Plan = plan;
  if (deducting) {
    const { remaining, deducted, short } = deduct(sourceOf(data, plan), totalInputs(recipe, runs));
    step.deducted = deducted;
    if (short.size > 0) {
      step.short = short;
    }
    if (plan.reserved) {
      updated = { ...plan, reserved: remaining };
    } else {
      next = { ...data, hangar: { stock: remaining } };
    }
  }
  updated = { ...updated, steps: [...plan.steps, step] };
  return replacePlan(next, index, updated);
}

/**
 * Marks a started step done, adding its recorded output: into the pile, up to what a reserved
 * plan still needs of it, the rest to general stock. Marking the plan's last target step done
 * completes the plan and returns its pile to general stock.
 */
export function completeStep(data: AppData, at: PlanAt, ref: StepRef, now: Timestamp): AppData | Refusal<StepRefusal> {
  const open = openPlan(data, at);
  if (isRefused(open)) {
    return open;
  }
  const found = findStep(open.plan, ref);
  if (isRefused(found) || ref.state !== "started") {
    return refuse({ kind: "stepNotFound", product: ref.product });
  }
  return complete(data, at.index, ref.index, now);
}

/**
 * Marks a not-started entry done in one go: either deducting its inputs as starting would,
 * or recording only its output. Either way it has no start time.
 */
export function completeDirectly(data: AppData, at: PlanAt, entry: EntryRef, now: Timestamp, deducting: boolean): AppData | Refusal<StepRefusal> {
  const open = openPlan(data, at);
  if (isRefused(open)) {
    return open;
  }
  const found = findEntry(data, open.plan, entry);
  if (isRefused(found)) {
    return found;
  }
  const started = withStarted(data, at.index, open.plan, found.recipe, entry.runs, now, deducting);
  const index = open.plan.steps.length;
  const done = complete(started, at.index, index, now);
  const plan = done.plans[at.index]!;
  const steps = plan.steps.map((s, i) => (i === index ? { ...s, started: undefined } : s));
  return replacePlan(done, at.index, { ...plan, steps });
}

function complete(data: AppData, planIndex: number, stepIndex: number, now: Timestamp): AppData {
  const plan = data.plans[planIndex]!;
  const step = plan.steps[stepIndex]!;
  const output = step.runs * step.outputPerRun;

  let toPile = 0;
  if (plan.reserved) {
    if (step.product === plan.target.product) {
      toPile = output;
    } else {
      // What the plan still needs of the item beyond its pile is what its started steps are
      // covering; this step's output fills that first.
      const result = calculatePlan(data, plan);
      toPile = Math.min(output, (result.ok && result.trace.get(step.product)?.onItsWay) || 0);
    }
  }
  const toGeneral = output - toPile;

  const doneStep: PlanStep = { ...step, state: "done", done: now, addedToReserved: toPile, addedToGeneral: toGeneral };
  let updated: Plan = {
    ...plan,
    reserved: plan.reserved && toPile > 0 ? addTo(plan.reserved, new Map([[step.product, toPile]])) : plan.reserved,
    steps: plan.steps.map((s, i) => (i === stepIndex ? doneStep : s)),
  };
  let stock = toGeneral > 0 ? addTo(data.hangar.stock, new Map([[step.product, toGeneral]])) : data.hangar.stock;

  // Finishing a plan: its target runs are all done.
  const targetRunsDone = updated.steps.filter((s) => s.state === "done" && s.product === plan.target.product).reduce((n, s) => n + s.runs, 0);
  const targetRunsStarted = updated.steps.some((s) => s.state === "started" && s.product === plan.target.product);
  if (step.product === plan.target.product && targetRunsDone >= plan.runs && !targetRunsStarted) {
    if (updated.reserved) {
      stock = addTo(stock, updated.reserved);
    }
    updated = { ...updated, reserved: undefined, completed: now };
  }

  return { ...replacePlan(data, planIndex, updated), hangar: { stock } };
}

/** How much of a done step's output can no longer be removed, because it has been spent since. */
export function revertShortfall(data: AppData, at: PlanAt, ref: StepRef): number {
  const plan = planAt(data, at);
  const step = plan?.steps[ref.index];
  if (!plan || !step || step.state !== "done") {
    return 0;
  }
  return removal(data, plan, step).notRemoved;
}

/**
 * Moves a step back. Done goes back to started, removing the output from where it went
 * (clamped at zero, recording what could not be removed); a step that was done without
 * being started goes straight back to not started. Started goes back to not started,
 * returning exactly what was deducted.
 */
export function revertStep(data: AppData, at: PlanAt, ref: StepRef): AppData | Refusal<StepRefusal> {
  const open = openPlan(data, at);
  if (isRefused(open)) {
    return open;
  }
  const found = findStep(open.plan, ref);
  if (isRefused(found)) {
    return found;
  }
  let plan = open.plan;
  let next = data;
  let step = found.step;

  if (step.state === "done") {
    const { stock, reserved, notRemoved } = removal(data, plan, step);
    next = { ...next, hangar: { stock } };
    plan = { ...plan, reserved };
    step = { ...step, state: "started", done: undefined, addedToReserved: undefined, addedToGeneral: undefined, notRemoved: notRemoved > 0 ? notRemoved : undefined };
    if (step.started !== undefined) {
      return replacePlan(next, at.index, { ...plan, steps: plan.steps.map((s, i) => (i === ref.index ? step : s)) });
    }
  }

  // Back to not started: the step leaves the list, and what it took goes back where it came from.
  if (step.deducted) {
    if (step.takenFrom === "reserved" && plan.reserved) {
      plan = { ...plan, reserved: addTo(plan.reserved, step.deducted) };
    } else {
      next = { ...next, hangar: { stock: addTo(next.hangar.stock, step.deducted) } };
    }
  }
  return replacePlan(next, at.index, { ...plan, steps: plan.steps.filter((_, i) => i !== ref.index) });
}

/** A done step's output taken back out: from the pile if the plan is still reserved, else from general stock. */
function removal(data: AppData, plan: Plan, step: PlanStep): { stock: Quantities; reserved?: Quantities; notRemoved: number } {
  const product = step.product;
  let stock = data.hangar.stock;
  let reserved = plan.reserved;
  let notRemoved = 0;
  const fromReserved = step.addedToReserved ?? 0;
  const fromGeneral = step.addedToGeneral ?? 0;
  if (reserved) {
    const r = deduct(reserved, new Map([[product, fromReserved]]));
    reserved = r.remaining;
    notRemoved += r.short.get(product) ?? 0;
    const g = deduct(stock, new Map([[product, fromGeneral]]));
    stock = g.remaining;
    notRemoved += g.short.get(product) ?? 0;
  } else {
    const g = deduct(stock, new Map([[product, fromReserved + fromGeneral]]));
    stock = g.remaining;
    notRemoved += g.short.get(product) ?? 0;
  }
  return { stock, reserved, notRemoved };
}

/** Takes `wanted` out of `from`, never below zero: what is left, what was taken, and what was missing. */
function deduct(from: Quantities, wanted: Quantities): { remaining: Quantities; deducted: Quantities; short: Quantities } {
  const remaining = new Map(from);
  const deducted: Quantities = new Map();
  const short: Quantities = new Map();
  for (const [item, quantity] of wanted) {
    const have = remaining.get(item) ?? 0;
    const taken = Math.min(have, quantity);
    if (taken > 0) {
      deducted.set(item, taken);
    }
    if (have - taken > 0) {
      remaining.set(item, have - taken);
    } else {
      remaining.delete(item);
    }
    if (quantity > taken) {
      short.set(item, quantity - taken);
    }
  }
  return { remaining, deducted, short };
}

function replacePlan(data: AppData, index: number, plan: Plan): AppData {
  return { ...data, plans: data.plans.map((p, i) => (i === index ? plan : p)) };
}
