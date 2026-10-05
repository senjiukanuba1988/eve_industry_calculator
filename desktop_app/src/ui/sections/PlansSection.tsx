import type { Plan } from "../../core/data/model";
import { useAppData, useGoTo } from "../context";
import { formatTime, recipeName } from "../format";
import { RecipeTable } from "../RecipeTable";

/**
 * What the Plans section shows depends on what exists (application-shell spec): the open
 * plans; or, with recipes but no open plan, the recipes to start one from; or, with
 * nothing at all, the way to the first recipe.
 */
export function PlansSection() {
  const data = useAppData();
  const goTo = useGoTo();
  const open = data.plans.filter((p) => p.completed === undefined);

  if (open.length > 0) {
    return (
      <section aria-label="Plans">
        <h1>Plans</h1>
        <OpenPlans plans={open} />
      </section>
    );
  }

  if (data.recipes.length > 0) {
    return (
      <section aria-label="Plans">
        <h1>Plans</h1>
        <p>No open plans. A plan is made from a recipe and a number of runs - pick what to build:</p>
        <RecipeTable recipes={data.recipes} />
        <p className="muted">Creating a plan from a recipe is not built yet.</p>
      </section>
    );
  }

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

function OpenPlans({ plans }: { plans: readonly Plan[] }) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Plan</th>
          <th>Target</th>
          <th className="num">Runs</th>
          <th className="num">Started</th>
          <th className="num">Done</th>
          <th>Reserved</th>
          <th>Created</th>
        </tr>
      </thead>
      <tbody>
        {plans.map((p) => (
          <tr key={p.name}>
            <td>{p.name}</td>
            <td>{recipeName(p.target)}</td>
            <td className="num">{p.runs}</td>
            <td className="num">{p.steps.filter((s) => s.state === "started").length}</td>
            <td className="num">{p.steps.filter((s) => s.state === "done").length}</td>
            <td>{p.reserved ? "yes" : ""}</td>
            <td>{formatTime(p.created)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
