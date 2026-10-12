import { useState } from "react";
import type { Plan } from "../../core/data/model";
import { deletePlan, type PlanAt, type PlanRefusal } from "../../core/plans/plans";
import { useAction, useConfirm } from "../context";
import { formatQuantity } from "../format";

/** Deleting a plan after a confirmation saying what happens to its material (application-shell spec). */
export function useDeletePlan() {
  const confirm = useConfirm();
  const action = useAction<PlanRefusal>();
  const [refusal, setRefusal] = useState<PlanRefusal>();

  const run = async (plan: Plan, at: PlanAt): Promise<boolean> => {
    const started = plan.steps.filter((s) => s.state === "started").length;
    const done = plan.steps.filter((s) => s.state === "done").length;
    const consequences = [
      started + done > 0
        ? `The plan and its progress (${started} started, ${done} done) are removed.`
        : "The plan is removed. No step of it has been started.",
    ];
    if (plan.reserved) {
      consequences.push(
        plan.reserved.size > 0
          ? `Its reserved materials return to the hangar: ${[...plan.reserved].map(([item, q]) => `${formatQuantity(q)} ${item}`).join(", ")}.`
          : "Its reservation is released; it holds no material at the moment.",
      );
    }
    if (started > 0) {
      consequences.push("Material already consumed by started steps stays spent.");
    }
    if (done > 0) {
      consequences.push("Output of completed steps stays in the hangar.");
    }
    const confirmed = await confirm({ title: `Delete the plan ${plan.name}?`, consequences, confirmLabel: "Delete plan" });
    if (!confirmed) {
      return false;
    }
    const result = await action.run((d) => deletePlan(d, at));
    setRefusal(result.status === "refused" ? result.reason : undefined);
    return result.status === "saved";
  };

  return { run, refusal, pending: action.pending, failure: action.failure, warning: action.warning, dismiss: action.dismiss };
}
