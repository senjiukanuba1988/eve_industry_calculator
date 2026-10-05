import { useState } from "react";
import { RECIPE_TYPES, type Recipe, type RecipeRef, type RecipeType } from "../../core/data/model";
import { compareNames } from "../../core/data/names";
import { deleteRecipe, deleteRecipeEffect, filterRecipes, type DeleteRecipeRefusal, type RecipeFilter } from "../../core/recipes/library";
import { nextFormId, useAction, useAppData, useConfirm, type RecipesView } from "../context";
import { Failure } from "../Failure";
import { formatQuantity, recipeName } from "../format";
import { RecipeForm } from "./RecipeForm";

interface RecipesSectionProps {
  view: RecipesView;
  onViewChange: (view: RecipesView) => void;
}

/** Filter values that cannot clash with a category name, since names never start with a space. */
const ANY = "";
const NONE = " none";

export function RecipesSection({ view, onViewChange }: RecipesSectionProps) {
  const data = useAppData();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<RecipeType | typeof ANY>(ANY);
  const [category, setCategory] = useState(ANY);

  const list = () => onViewChange({ kind: "list" });
  const form = (original?: RecipeRef) => onViewChange({ kind: "form", original, id: nextFormId() });

  if (view.kind === "form") {
    return (
      <section aria-label="Recipes">
        <RecipeForm key={view.id} original={view.original} onSaved={(again) => (again ? form() : list())} onCancel={list} />
      </section>
    );
  }

  const categories = [...data.items.categories.keys()].sort(compareNames);
  // A category deleted or renamed while selected shows everything rather than nothing.
  const categoryFilter = category === ANY || category === NONE || data.items.categories.has(category) ? category : ANY;
  const filter: RecipeFilter = {
    search,
    type: type === ANY ? undefined : type,
    category: categoryFilter === ANY ? undefined : categoryFilter === NONE ? null : categoryFilter,
  };
  const recipes = filterRecipes(data, filter);
  const filtered = search.trim() !== "" || type !== ANY || categoryFilter !== ANY;

  return (
    <section aria-label="Recipes">
      <h1>Recipes</h1>
      <div className="toolbar">
        <button type="button" onClick={() => form()}>
          New recipe
        </button>
        <input
          type="search"
          placeholder="Search products"
          aria-label="Search products"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value as RecipeType | typeof ANY)}>
          <option value={ANY}>All types</option>
          {RECIPE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => setCategory(e.target.value)}>
          <option value={ANY}>All categories</option>
          <option value={NONE}>(no category)</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {recipes.length > 0 ? (
        <table className="grid">
          <thead>
            <tr>
              <th>Product</th>
              <th>Variant</th>
              <th>Type</th>
              <th className="num">Output / run</th>
              <th className="num">Inputs</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {recipes.map((r) => (
              <RecipeRow key={JSON.stringify([r.product, r.variant])} recipe={r} onOpen={form} />
            ))}
          </tbody>
        </table>
      ) : (
        <p>{filtered ? "No recipe matches." : "No recipes yet."}</p>
      )}
    </section>
  );
}

function RecipeRow({ recipe, onOpen }: { recipe: Recipe; onOpen: (recipe: RecipeRef) => void }) {
  const data = useAppData();
  const confirm = useConfirm();
  const action = useAction<DeleteRecipeRefusal>();
  const [refusal, setRefusal] = useState<DeleteRecipeRefusal>();
  const ref: RecipeRef = { product: recipe.product, variant: recipe.variant };
  const name = recipeName(ref);

  const remove = async () => {
    const { remaining } = deleteRecipeEffect(data, ref);
    const confirmed = await confirm({
      title: `Delete the recipe for ${name}?`,
      consequences: [
        `The recipe is removed: ${formatQuantity(recipe.output)} ${recipe.product} per run from ${recipe.inputs.size} ${recipe.inputs.size === 1 ? "input" : "inputs"}.`,
        remaining.length === 0
          ? `Nothing makes ${recipe.product} any more, so it becomes a base material: calculations list it to acquire instead of building it.`
          : `${recipe.product} can still be made with ${remaining.map(recipeName).join(", ")}.`,
      ],
      confirmLabel: "Delete recipe",
    });
    if (!confirmed) {
      return;
    }
    const result = await action.run((d) => deleteRecipe(d, ref));
    setRefusal(result.status === "refused" ? result.reason : undefined);
  };

  return (
    <>
      <tr>
        <td>
          <button type="button" className="link" onClick={() => onOpen(ref)}>
            {recipe.product}
          </button>
        </td>
        <td>{recipe.variant}</td>
        <td>{recipe.type}</td>
        <td className="num">{formatQuantity(recipe.output)}</td>
        <td className="num">{recipe.inputs.size}</td>
        <td className="row-actions">
          <button type="button" className="link" aria-label={`Delete ${name}`} disabled={action.pending} onClick={() => void remove()}>
            Delete
          </button>
        </td>
      </tr>
      {(refusal || action.failure || action.warning) && (
        <tr>
          <td colSpan={6}>
            {refusal && (
              <span className="failure" role="alert">
                {refusal.kind === "targetedByPlans"
                  ? `Open plans build this recipe (${refusal.plans.join(", ")}). Complete or delete them first.`
                  : "This recipe no longer exists."}
              </span>
            )}
            <Failure action={action} />
          </td>
        </tr>
      )}
    </>
  );
}
