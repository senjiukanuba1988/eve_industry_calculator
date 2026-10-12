// Completed plans are kept for seven days (production-plans spec, "Completed plans are
// removed after a week"; design/data-files.md, "Retention").

import type { AppData } from "../data/model";
import { KEEP_COMPLETED_DAYS } from "./plans";

const KEEP_MS = KEEP_COMPLETED_DAYS * 24 * 60 * 60 * 1000;

/** Without the plans completed more than seven days (7 x 24 hours) before `now`. The hangar is untouched. */
export function removeExpiredPlans(data: AppData, now: Date): AppData {
  const plans = data.plans.filter((p) => p.completed === undefined || now.getTime() - new Date(p.completed).getTime() <= KEEP_MS);
  return plans.length === data.plans.length ? data : { ...data, plans };
}
