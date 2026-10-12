// What a change to the recipes means for open plans (recipe-library spec, "Changing a recipe
// that plans depend on"; production-plans spec, "A reserved plan draws only on its own pile";
// material-calculation spec, "A second variant is added later").
//
// A plan counts as affected only when its outstanding work changes: the steps, runs and
// inputs still to do, what is left to acquire, the choices it waits for, or what it draws
// from available material. Editing notes or a label, or a recipe the plan does not need
// right now, affects nothing.

import type { AppData, Plan, Recipe } from "../data/model";
import { addTo, calculatePlan, type PlanAt } from "../plans/plans";

export interface AffectedPlan {
  at: PlanAt;
  /** Reserved before the change; the change releases its reservation. */
  reserved: boolean;
}

/**
 * The incomplete plans whose outstanding work differs between `before` and `after`. Plans
 * are matched by their place in the list, which a recipe change never alters.
 */
export function plansChangedBy(before: AppData, after: AppData): AffectedPlan[] {
  const affected: AffectedPlan[] = [];
  before.plans.forEach((plan, index) => {
    const changed = after.plans[index];
    if (plan.completed !== undefined || !changed) {
      return;
    }
    if (work(before, plan) !== work(after, changed)) {
      affected.push({ at: { index, name: plan.name }, reserved: plan.reserved !== undefined });
    }
  });
  return affected;
}

/**
 * `after`, with the reservation of every reserved plan whose work the change alters
 * released: its pile returns to general stock and it continues unreserved.
 */
export function releaseChanged(before: AppData, after: AppData): AppData {
  const release = new Set(
    plansChangedBy(before, after)
      .filter((p) => p.reserved)
      .map((p) => p.at.index),
  );
  if (release.size === 0) {
    return after;
  }
  let stock = after.hangar.stock;
  const plans = after.plans.map((p, i) => {
    if (!release.has(i) || !p.reserved) {
      return p;
    }
    stock = addTo(stock, p.reserved);
    return { ...p, reserved: undefined };
  });
  return { ...after, hangar: { stock }, plans };
}

/**
 * Whether working the plan with these recipes reaches `product` as an intermediate, whether
 * or not available material covers it right now. The target's own product does not count:
 * the target names its recipe itself. The walk stops at intermediates waiting for a choice.
 */
export function planReaches(recipes: readonly Recipe[], plan: Plan, product: string): boolean {
  const byProduct = new Map<string, Recipe[]>();
  for (const r of recipes) {
    byProduct.set(r.product, [...(byProduct.get(r.product) ?? []), r]);
  }
  const target = byProduct.get(plan.target.product)?.find((r) => r.variant === plan.target.variant);
  if (!target || product === target.product) {
    return false;
  }
  const seen = new Set<string>();
  const reaches = (recipe: Recipe): boolean =>
    [...recipe.inputs.keys()].some((item) => {
      if (item === product) {
        return true;
      }
      if (seen.has(item) || item === target.product) {
        return false;
      }
      seen.add(item);
      const candidates = byProduct.get(item) ?? [];
      const choice = plan.variantChoices.get(item);
      const next = choice !== undefined ? candidates.find((r) => r.variant === choice) : candidates.length === 1 ? candidates[0] : undefined;
      return next !== undefined && reaches(next);
    });
  return reaches(target);
}

/**
 * The plan's outstanding work as a comparable string. Variant labels are left out, since
 * relabelling changes no work, and so is the order of the steps, which can shift without
 * any step changing (a started step whose recipe is deleted moves down a tier).
 */
function work(data: AppData, plan: Plan): string {
  const result = calculatePlan(data, plan);
  if (!result.ok) {
    return "target missing";
  }
  const sorted = (q: Iterable<[string, number]>) => [...q].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([
    result.acquire,
    result.builds.map((b) => JSON.stringify([b.product, b.state, b.step, b.runs, b.output, sorted(b.inputs)])).sort(),
    result.choicesNeeded.map((c) => [c.product, c.stillNeeded]),
    sorted(result.fromAvailable),
  ]);
}
