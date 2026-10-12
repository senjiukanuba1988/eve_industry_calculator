// Resetting the hangar (hangar spec, "Resetting the hangar"): to resynchronise with the
// game, everything held is cleared and every incomplete plan starts over against what is
// pasted next. Never refused.

import type { AppData } from "../data/model";

/** What a reset will clear, for the confirmation. */
export interface ResetEffect {
  /** Items with general stock. */
  stockItems: number;
  /** Plans holding a reservation. */
  reservedPlans: string[];
  /** Incomplete plans with started or done steps, and how many. */
  plansWithProgress: Array<{ plan: string; started: number; done: number }>;
}

export function resetEffect(data: AppData): ResetEffect {
  const open = data.plans.filter((p) => p.completed === undefined);
  return {
    stockItems: data.hangar.stock.size,
    reservedPlans: open.filter((p) => p.reserved).map((p) => p.name),
    plansWithProgress: open
      .filter((p) => p.steps.length > 0)
      .map((p) => ({
        plan: p.name,
        started: p.steps.filter((s) => s.state === "started").length,
        done: p.steps.filter((s) => s.state === "done").length,
      })),
  };
}

/**
 * Clears all stock, releases every reservation (the pile is cleared, not returned) and
 * clears the steps, with their times, of every incomplete plan. Plans keep their name,
 * target, runs and recipe choices; completed plans are left exactly as they are.
 */
export function resetHangar(data: AppData): AppData {
  return {
    ...data,
    hangar: { stock: new Map() },
    plans: data.plans.map((p) => (p.completed !== undefined ? p : { ...p, reserved: undefined, steps: [] })),
  };
}
