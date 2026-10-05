// Reservations (production-plans spec, "Reserving a plan's materials" and "Releasing a
// reservation"). Releasing is here; reserving comes with task 27.

import type { AppData } from "../data/model";
import { refuse, type Refusal } from "../refusal";

/**
 * A plan, as the screen knows it: its place in the list, and its name as a guard. Plan names
 * need not be unique, and an action runs later than it was asked for, so a plan whose name
 * at that place has changed is treated as gone rather than acting on the wrong one.
 */
export interface PlanAt {
  index: number;
  name: string;
}

export type ReservationRefusal = { kind: "planNotFound"; plan: string } | { kind: "notReserved"; plan: string };

/** Returns everything in a plan's reserved pile to general stock. The plan keeps its step progress. */
export function releaseReservation(data: AppData, at: PlanAt): AppData | Refusal<ReservationRefusal> {
  const plan = data.plans[at.index];
  if (!plan || plan.name !== at.name) {
    return refuse({ kind: "planNotFound", plan: at.name });
  }
  if (!plan.reserved) {
    return refuse({ kind: "notReserved", plan: at.name });
  }
  const stock = new Map(data.hangar.stock);
  for (const [item, quantity] of plan.reserved) {
    stock.set(item, (stock.get(item) ?? 0) + quantity);
  }
  return {
    ...data,
    hangar: { stock },
    plans: data.plans.map((p, i) => (i === at.index ? { ...p, reserved: undefined } : p)),
  };
}
