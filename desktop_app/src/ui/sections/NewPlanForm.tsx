import { useState, type FormEvent } from "react";
import type { RecipeRef } from "../../core/data/model";
import { createPlan, suggestPlanName, type PlanAt, type PlanRefusal } from "../../core/plans/plans";
import { filterRecipes } from "../../core/recipes/library";
import { useAction, useAppData, useNow, useStore } from "../context";
import { Failure } from "../Failure";
import { formatQuantity, parseWhole, recipeName } from "../format";
import { RecipeTable } from "../RecipeTable";

interface NewPlanFormProps {
  /** Already chosen, when the plan was started from a recipe. */
  target?: RecipeRef;
  onCreated: (at: PlanAt) => void;
  onCancel: () => void;
}

/**
 * A new plan: first the recipe to build, picked from the library (each variant is its own
 * row, so picking a row is picking the variant), then the runs and the name. Target and
 * runs are fixed once the plan exists, which the form says.
 */
export function NewPlanForm({ target: initialTarget, onCreated, onCancel }: NewPlanFormProps) {
  const data = useAppData();
  const store = useStore();
  const now = useNow();
  const action = useAction<PlanRefusal>();
  const [target, setTarget] = useState(initialTarget);
  const [search, setSearch] = useState("");
  const [runs, setRuns] = useState("1");
  /** The name as typed; undefined while the user has not typed one, so it follows the suggestion. */
  const [typedName, setTypedName] = useState<string>();
  const [refusal, setRefusal] = useState<PlanRefusal>();

  const recipe = target && data.recipes.find((r) => r.product === target.product && r.variant === target.variant);
  const runCount = parseWhole(runs);
  const runsValid = Number.isSafeInteger(runCount) && runCount >= 1;
  const suggested = recipe && runsValid ? suggestPlanName(recipe, runCount) : "";
  const name = typedName ?? suggested;

  if (!recipe) {
    return (
      <div>
        <h1>New plan</h1>
        <p>Pick the recipe to build:</p>
        <div className="toolbar">
          <input
            type="search"
            placeholder="Search products"
            aria-label="Search recipes to build"
            value={search}
            autoFocus
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
        {target && <p className="failure">The recipe {recipeName(target)} no longer exists. Pick another.</p>}
        <RecipeTable recipes={filterRecipes(data, { search })} onOpen={setTarget} />
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await action.run((d) => createPlan(d, { target: recipe, runs: runCount, name }, now()));
    setRefusal(result.status === "refused" ? result.reason : undefined);
    if (result.status === "saved") {
      const plans = store.current.plans;
      onCreated({ index: plans.length - 1, name: plans.at(-1)!.name });
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)}>
      <h1>New plan</h1>
      <div className="form-grid">
        <span className="label">Recipe</span>
        <span>
          {recipeName(recipe)}{" "}
          <button type="button" className="link" onClick={() => setTarget(undefined)}>
            Change
          </button>
        </span>

        <label htmlFor="plan-runs" className="label">
          Runs
        </label>
        <span>
          <input
            id="plan-runs"
            className="quantity"
            value={runs}
            autoFocus
            aria-invalid={runsValid ? undefined : true}
            onChange={(e) => setRuns(e.target.value)}
          />{" "}
          {runsValid ? (
            <span className="muted">
              makes {formatQuantity(runCount * recipe.output)} {recipe.product}
            </span>
          ) : (
            <span className="field-problem">A whole number of at least 1.</span>
          )}
        </span>

        <label htmlFor="plan-name" className="label">
          Name
        </label>
        <span>
          <input id="plan-name" value={name} size={40} onChange={(e) => setTypedName(e.target.value)} />
          {refusal?.kind === "nameEmpty" && <span className="field-problem">A plan needs a name.</span>}
        </span>
      </div>
      <p className="muted">Recipe and runs cannot be changed once the plan exists. To build more, create another plan.</p>
      {refusal && refusal.kind !== "nameEmpty" && (
        <p className="failure" role="alert">
          {refusal.kind === "recipeNotFound" ? "That recipe no longer exists." : "The plan could not be created."}
        </p>
      )}
      <Failure action={action} />
      <div className="actions">
        <button type="submit" disabled={!runsValid || name.trim() === "" || action.pending}>
          Create plan
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
