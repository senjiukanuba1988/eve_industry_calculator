import type { RecipeRef, Timestamp } from "../core/data/model";

/** "2026-10-04T16:32:05+02:00" as "2026-10-04 16:32": the time as it was where it was recorded. */
export function formatTime(time: Timestamp): string {
  return `${time.slice(0, 10)} ${time.slice(11, 16)}`;
}

/** "Acolyte II" or "Acolyte II (Accelerant Decryptor)". */
export function recipeName(ref: RecipeRef): string {
  return ref.variant === undefined ? ref.product : `${ref.product} (${ref.variant})`;
}

/** Whole quantities with thousands separators: 12,500. Fixed to "en" so it does not depend on the machine. */
export function formatQuantity(n: number): string {
  return n.toLocaleString("en");
}

/** "10,000" or "10000" as 10000; anything else as NaN, which the action refuses or the form reports at the field. */
export function parseWhole(text: string): number {
  const compact = text.replace(/[\s,]/g, "");
  return /^\d+$/.test(compact) ? Number(compact) : Number.NaN;
}
