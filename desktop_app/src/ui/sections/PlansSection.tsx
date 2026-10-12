import type { Plan } from "../../core/data/model";
import { KEEP_COMPLETED_DAYS, removalDate, type PlanAt } from "../../core/plans/plans";
import { nextFormId, useAppData, useGoTo, type PlansView } from "../context";
import { formatQuantity, formatTime, recipeName } from "../format";
import { RecipeTable } from "../RecipeTable";
import { useDeletePlan } from "./deletePlan";
import { DeletePlanProblem } from "./DeletePlanProblem";
import { NewPlanForm } from "./NewPlanForm";
import { PlanView } from "./PlanView";

interface PlansSectionProps {
  view: PlansView;
  onViewChange: (view: PlansView) => void;
}

/**
 * What the Plans section shows depends on what exists (application-shell spec): the open
 * plans; or, with recipes but no open plan, the recipes to start one from; or, with
 * nothing at all, the way to the first recipe. A plan or the new-plan form replaces the list.
 */
export function PlansSection({ view, onViewChange }: PlansSectionProps) {
  const data = useAppData();
  const goTo = useGoTo();
  const list = (completed?: boolean) => onViewChange({ kind: "list", completed });
  const newPlan = (target?: Plan["target"]) => onViewChange({ kind: "new", target, id: nextFormId() });
  const openPlan = (at: PlanAt) => onViewChange({ kind: "plan", at });

  if (view.kind === "new") {
    return (
      <section aria-label="Plans">
        <NewPlanForm key={view.id} target={view.target} onCreated={openPlan} onCancel={() => list()} />
      </section>
    );
  }
  if (view.kind === "plan") {
    return (
      <section aria-label="Plans">
        <PlanView at={view.at} onAtChange={openPlan} onClose={() => list(data.plans[view.at.index]?.completed !== undefined)} />
      </section>
    );
  }

  const indexed = data.plans.map((plan, index) => ({ plan, at: { index, name: plan.name } }));
  const open = indexed.filter((p) => p.plan.completed === undefined);
  const completed = indexed.filter((p) => p.plan.completed !== undefined);

  if (data.recipes.length === 0 && data.plans.length === 0) {
    return (
      <section aria-label="Plans">
        <h1>Plans</h1>
        <p>
          A plan works out everything a build needs - every intermediate step and every base material - from a recipe and the number of runs.
          There are no recipes yet, so start with one.
        </p>
        <div className="actions">
          <button type="button" onClick={() => goTo({ section: "recipes", open: "new" })}>
            Create the first recipe
          </button>
        </div>
      </section>
    );
  }

  const showCompleted = view.completed === true;
  const shown = showCompleted ? completed : open;
  return (
    <section aria-label="Plans">
      <h1>Plans</h1>
      <div className="toolbar">
        <button type="button" onClick={() => newPlan()} disabled={data.recipes.length === 0}>
          New plan
        </button>
        <div className="segmented" role="group" aria-label="Which plans">
          <button type="button" aria-pressed={!showCompleted} onClick={() => list(false)}>
            Open ({open.length})
          </button>
          <button type="button" aria-pressed={showCompleted} onClick={() => list(true)}>
            Completed ({completed.length})
          </button>
        </div>
      </div>
      {shown.length > 0 ? (
        <PlanTable plans={shown} completed={showCompleted} onOpen={openPlan} />
      ) : showCompleted ? (
        <p>No completed plans. Completed plans are kept for {KEEP_COMPLETED_DAYS} days, then removed when the application starts.</p>
      ) : data.recipes.length > 0 ? (
        <>
          <p>No open plans. A plan is made from a recipe and a number of runs - pick what to build:</p>
          <RecipeTable recipes={data.recipes} onOpen={(r) => newPlan(r)} />
        </>
      ) : (
        <p>No open plans, and no recipes to start one from.</p>
      )}
    </section>
  );
}

interface IndexedPlan {
  plan: Plan;
  at: PlanAt;
}

function PlanTable({ plans, completed, onOpen }: { plans: IndexedPlan[]; completed: boolean; onOpen: (at: PlanAt) => void }) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Plan</th>
          <th>Target</th>
          <th className="num">Runs</th>
          {completed ? (
            <>
              <th>Completed</th>
              <th>Removed on</th>
            </>
          ) : (
            <>
              <th className="num">Started</th>
              <th className="num">Done</th>
              <th>Reserved</th>
            </>
          )}
          <th>Created</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {plans.map(({ plan, at }) => (
          <PlanRow key={at.index} plan={plan} at={at} completed={completed} onOpen={onOpen} />
        ))}
      </tbody>
    </table>
  );
}

function PlanRow({ plan, at, completed, onOpen }: IndexedPlan & { completed: boolean; onOpen: (at: PlanAt) => void }) {
  const remove = useDeletePlan();
  return (
    <>
      <tr>
        <td>
          <button type="button" className="link" onClick={() => onOpen(at)}>
            {plan.name}
          </button>
        </td>
        <td>{recipeName(plan.target)}</td>
        <td className="num">{formatQuantity(plan.runs)}</td>
        {completed ? (
          <>
            <td>{plan.completed && formatTime(plan.completed)}</td>
            <td>{plan.completed && removalDate(plan.completed)}</td>
          </>
        ) : (
          <>
            <td className="num">{plan.steps.filter((s) => s.state === "started").length}</td>
            <td className="num">{plan.steps.filter((s) => s.state === "done").length}</td>
            <td>{plan.reserved ? "yes" : ""}</td>
          </>
        )}
        <td>{formatTime(plan.created)}</td>
        <td className="row-actions">
          <button type="button" className="link" aria-label={`Delete ${plan.name}`} disabled={remove.pending} onClick={() => void remove.run(plan, at)}>
            Delete
          </button>
        </td>
      </tr>
      {(remove.refusal || remove.failure || remove.warning) && (
        <tr>
          <td colSpan={8}>
            <DeletePlanProblem remove={remove} />
          </td>
        </tr>
      )}
    </>
  );
}
