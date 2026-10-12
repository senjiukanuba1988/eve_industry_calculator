// Wording shared by the confirmations for changing a recipe that open plans depend on
// (recipe-library spec, "Changing a recipe that plans depend on").

import type { AffectedPlan } from "../../core/recipes/planImpact";

/** What the change means for the affected plans that are not reserved; empty if there are none. */
export function changeConsequences(affected: readonly AffectedPlan[], how: string): string[] {
  const names = affected.filter((p) => !p.reserved).map((p) => p.at.name);
  return names.length === 0 ? [] : [`${how}: ${names.join(", ")}.`];
}

/** What releasing the affected reserved plans' reservations means; empty if none is reserved. */
export function releaseConsequences(affected: readonly AffectedPlan[]): string[] {
  const names = affected.filter((p) => p.reserved).map((p) => p.at.name);
  if (names.length === 0) {
    return [];
  }
  const one = names.length === 1;
  return [
    one
      ? `${names[0]} has reserved its materials and this changes what it needs, so its reservation is released: everything in its reserved pile returns to the hangar.`
      : `These plans have reserved their materials and this changes what they need, so their reservations are released, everything in their reserved piles returning to the hangar: ${names.join(", ")}.`,
    `${one ? "It" : "They"} can be reserved again once the hangar covers the new needs.`,
  ];
}
