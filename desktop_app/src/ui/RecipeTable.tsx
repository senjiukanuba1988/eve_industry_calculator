import type { Recipe, RecipeRef } from "../core/data/model";
import { compareRecipes } from "../core/data/serialize";
import { formatQuantity } from "./format";

/** Recipes as a compact table, sorted by product and variant. With `onOpen`, each product opens its recipe. */
export function RecipeTable({ recipes, onOpen }: { recipes: readonly Recipe[]; onOpen?: (recipe: RecipeRef) => void }) {
  const sorted = [...recipes].sort(compareRecipes);
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Product</th>
          <th>Variant</th>
          <th>Type</th>
          <th className="num">Output / run</th>
          <th className="num">Inputs</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr key={JSON.stringify([r.product, r.variant])}>
            <td>
              {onOpen ? (
                <button type="button" className="link" onClick={() => onOpen({ product: r.product, variant: r.variant })}>
                  {r.product}
                </button>
              ) : (
                r.product
              )}
            </td>
            <td>{r.variant}</td>
            <td>{r.type}</td>
            <td className="num">{formatQuantity(r.output)}</td>
            <td className="num">{r.inputs.size}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
