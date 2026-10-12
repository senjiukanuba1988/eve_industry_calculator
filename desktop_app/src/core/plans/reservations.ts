// Reservations (production-plans spec, "Reserving a plan's materials", "Releasing a
// reservation" and "A reserved plan draws only on its own pile").

import type { AppData, Quantities } from "../data/model";
import { refuse, type Refusal } from "../refusal";
import { addTo, calculatePlan, planAt, type PlanAt } from "./plans";

export type { PlanAt } from "./plans";

export type ReservationRefusal =
  | { kind: "planNotFound"; plan: string }
  | { kind: "notReserved"; plan: string }
  | { kind: "alreadyReserved"; plan: string }
  | { kind: "planCompleted"; plan: string }
  /** Reserving is all or nothing: these are still to acquire. */
  | { kind: "missing"; missing: Array<{ item: string; quantity: number }> }
  /** What the plan needs is not known until these recipe choices are made. */
  | { kind: "choicesNeeded"; products: string[] };

/**
 * Moves exactly what the plan takes from general stock - intermediates included, not only
 * base materials - into its own pile. Only when nothing is left to acquire.
 */
export function reservePlan(data: AppData, at: PlanAt): AppData | Refusal<ReservationRefusal> {
  const plan = planAt(data, at);
  if (!plan) {
    return refuse({ kind: "planNotFound", plan: at.name });
  }
  if (plan.completed !== undefined) {
    return refuse({ kind: "planCompleted", plan: at.name });
  }
  if (plan.reserved) {
    return refuse({ kind: "alreadyReserved", plan: at.name });
  }
  const result = calculatePlan(data, plan);
  if (!result.ok) {
    return refuse({ kind: "planNotFound", plan: at.name });
  }
  if (result.choicesNeeded.length > 0) {
    return refuse({ kind: "choicesNeeded", products: result.choicesNeeded.map((c) => c.product) });
  }
  if (result.acquire.length > 0) {
    return refuse({ kind: "missing", missing: result.acquire });
  }
  const stock: Quantities = new Map(data.hangar.stock);
  for (const [item, quantity] of result.fromAvailable) {
    const left = (stock.get(item) ?? 0) - quantity;
    if (left > 0) {
      stock.set(item, left);
    } else {
      stock.delete(item);
    }
  }
  return {
    ...data,
    hangar: { stock },
    plans: data.plans.map((p, i) => (i === at.index ? { ...p, reserved: new Map(result.fromAvailable) } : p)),
  };
}

/** Returns everything in a plan's reserved pile to general stock. The plan keeps its step progress. */
export function releaseReservation(data: AppData, at: PlanAt): AppData | Refusal<ReservationRefusal> {
  const plan = planAt(data, at);
  if (!plan) {
    return refuse({ kind: "planNotFound", plan: at.name });
  }
  if (!plan.reserved) {
    return refuse({ kind: "notReserved", plan: at.name });
  }
  return {
    ...data,
    hangar: { stock: addTo(data.hangar.stock, plan.reserved) },
    plans: data.plans.map((p, i) => (i === at.index ? { ...p, reserved: undefined } : p)),
  };
}
