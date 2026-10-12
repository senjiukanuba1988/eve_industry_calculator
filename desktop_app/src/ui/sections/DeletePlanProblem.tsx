import { Failure } from "../Failure";
import type { useDeletePlan } from "./deletePlan";

/** Why deleting a plan did not happen, shown where it was attempted. */
export function DeletePlanProblem({ remove }: { remove: ReturnType<typeof useDeletePlan> }) {
  return (
    <>
      {remove.refusal && (
        <span className="failure" role="alert">
          This plan no longer exists.
        </span>
      )}
      <Failure action={remove} />
    </>
  );
}
