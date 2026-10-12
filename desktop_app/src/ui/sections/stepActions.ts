import { useState } from "react";
import type { BuildEntry } from "../../core/calculation/calculate";
import type { PlanStep, Quantities } from "../../core/data/model";
import type { PlanAt } from "../../core/plans/plans";
import {
  completeDirectly,
  completeStep,
  revertShortfall,
  revertStep,
  startShortfall,
  startStep,
  type EntryRef,
  type StepRef,
  type StepRefusal,
} from "../../core/plans/steps";
import { isRefusal } from "../../core/refusal";
import { useAction, useChoose, useConfirm, useNow, useStore } from "../context";
import { formatQuantity } from "../format";

/**
 * Moving a plan's steps forwards and back (production-plans spec). Warnings are worked out
 * against the data as it is when the button is pressed; the change itself runs on the
 * latest data and refuses if the entry no longer reads as it did.
 */
export function useStepActions(at: PlanAt) {
  const store = useStore();
  const now = useNow();
  const confirm = useConfirm();
  const choose = useChoose();
  const action = useAction<StepRefusal>();
  const [refusal, setRefusal] = useState<StepRefusal>();

  const run = async (change: Parameters<typeof action.run>[0]) => {
    const result = await action.run(change);
    setRefusal(result.status === "refused" ? result.reason : undefined);
  };

  const entryRef = (b: BuildEntry): EntryRef => ({ product: b.product, variant: b.recipe.variant, runs: b.runs });

  /** Starts a not-started entry, after a warning listing exactly what is short, if anything is. */
  const start = async (b: BuildEntry) => {
    const ref = entryRef(b);
    const short = startShortfall(store.current, at, ref);
    if (isRefusal(short)) {
      setRefusal(short.refused);
      return;
    }
    if (short.size > 0) {
      const confirmed = await confirm({
        title: `Start ${formatQuantity(b.runs)} ${b.runs === 1 ? "run" : "runs"} of ${b.product} with too little?`,
        consequences: [
          `Short: ${list(short)}.`,
          "What there is gets used up, down to zero, and the shortfall is recorded on the step.",
        ],
        confirmLabel: "Start anyway",
      });
      if (!confirmed) {
        return;
      }
    }
    await run((d) => startStep(d, at, ref, now()));
  };

  /** Marks a not-started entry done, asking whether its inputs should be deducted now. */
  const completeNotStarted = async (b: BuildEntry) => {
    const ref = entryRef(b);
    const short = startShortfall(store.current, at, ref);
    if (isRefusal(short)) {
      setRefusal(short.refused);
      return;
    }
    const answer = await choose({
      title: `Mark ${b.product} done without starting it?`,
      consequences: [
        `Its inputs have not been taken from the hangar yet: ${list(b.inputs)}.`,
        ...(short.size > 0 ? [`Deducting them now would be short of ${list(short)}; quantities stop at zero.`] : []),
        `Either way, ${formatQuantity(b.output)} ${b.product} are added.`,
      ],
      confirmLabel: "Deduct inputs and add output",
      alternativeLabel: "Add output only",
    });
    if (answer === "cancel") {
      return;
    }
    await run((d) => completeDirectly(d, at, ref, now(), answer === "confirm"));
  };

  const completeStarted = (index: number, step: PlanStep) => run((d) => completeStep(d, at, stepRef(index, step), now()));

  /** Moves a step back; for a done step whose output has been spent since, after a warning. */
  const undo = async (index: number, step: PlanStep) => {
    const ref = stepRef(index, step);
    if (step.state === "done") {
      const notRemovable = revertShortfall(store.current, at, ref);
      if (notRemovable > 0) {
        const output = step.runs * step.outputPerRun;
        const confirmed = await confirm({
          title: `Undo ${step.product} done?`,
          consequences: [
            `${formatQuantity(notRemovable)} of the ${formatQuantity(output)} ${step.product} it added have been used since and cannot be removed.`,
            "What is there is removed, down to zero, and the rest is recorded on the step.",
          ],
          confirmLabel: "Undo anyway",
        });
        if (!confirmed) {
          return;
        }
      }
    }
    await run((d) => revertStep(d, at, ref));
  };

  return {
    start,
    completeNotStarted,
    completeStarted,
    undo,
    refusal,
    pending: action.pending,
    failure: action.failure,
    warning: action.warning,
    dismiss: () => {
      setRefusal(undefined);
      action.dismiss();
    },
  };
}

export type StepActions = ReturnType<typeof useStepActions>;

function stepRef(index: number, step: PlanStep): StepRef {
  return { index, product: step.product, state: step.state };
}

function list(q: Quantities): string {
  return [...q].map(([item, n]) => `${formatQuantity(n)} ${item}`).join(", ");
}
