// Creating and editing a recipe (recipe-library spec). Item names go through ItemField;
// saving is unavailable until every name is bound to an item; every rule the save breaks is
// shown at the field or row at fault, with everything typed kept for correcting.

import { useState, type FormEvent, type ReactNode } from "react";
import { combineDuplicateInputs, saveRecipe, type RecipeDraft, type RecipeProblem } from "../../core/recipes/saveRecipe";
import { RECIPE_TYPES, type AppData, type RecipeRef, type RecipeType } from "../../core/data/model";
import { useAction, useAppData } from "../context";
import { Failure } from "../Failure";
import { recipeName } from "../format";
import { ItemField, type ItemFieldValue } from "../ItemField";

interface Row {
  key: number;
  item: ItemFieldValue;
  quantity: string;
}

/** Keys only need to be unique among the rows on screen. */
let lastRowKey = 0;

function newRow(item: ItemFieldValue = { text: "" }, quantity = ""): Row {
  return { key: ++lastRowKey, item, quantity };
}

interface FormState {
  product: ItemFieldValue;
  type: RecipeType;
  variant: string;
  output: string;
  notes: string;
  rows: Row[];
}

interface RecipeFormProps {
  /** The recipe to edit; absent for a new one. */
  original?: RecipeRef;
  /** After saving: `again` when the user asked for a fresh form to enter the next recipe. */
  onSaved: (again: boolean) => void;
  onCancel: () => void;
}

export function RecipeForm({ original, onSaved, onCancel }: RecipeFormProps) {
  const data = useAppData();
  const [form, setForm] = useState<FormState>(() => initialState(data, original));
  const [problems, setProblems] = useState<RecipeProblem[]>([]);
  /** Shown once the save found the product's existing T2 recipe unlabelled. */
  const [existingLabel, setExistingLabel] = useState<string>();
  const action = useAction<RecipeProblem[]>();

  // There is always one empty row at the end to type the next input into.
  const update = (change: Partial<FormState>) =>
    setForm((f) => {
      const next = { ...f, ...change };
      return isBlank(next.rows.at(-1)) ? next : { ...next, rows: [...next.rows, newRow()] };
    });
  const updateRow = (key: number, change: Partial<Row>) =>
    update({ rows: form.rows.map((r) => (r.key === key ? { ...r, ...change } : r)) });

  const usedRows = form.rows.filter((r) => !isBlank(r));
  const unresolved = new Set<string | number>();
  if (form.product.item === undefined) {
    unresolved.add("product");
  }
  for (const r of usedRows) {
    if (r.item.item === undefined) {
      unresolved.add(r.key);
    }
  }

  // Problems refer to the draft's input rows, which are the rows in use, in order.
  const at = (field: "product" | "type" | "variant" | "existingLabel" | "output" | "inputs" | number) =>
    problems.filter((p) =>
      typeof field === "number" ? typeof p.field === "object" && p.field.rows.some((i) => usedRows[i]?.key === field) : p.field === field,
    );

  const choose = (product: ItemFieldValue) => {
    // A product that already has recipes takes their type, since all of them must share one.
    const sibling = original ? undefined : data.recipes.find((r) => r.product === product.item);
    update(sibling && product.item !== form.product.item ? { product, type: sibling.type } : { product });
  };

  const save = async (again: boolean) => {
    if (unresolved.size > 0) {
      return;
    }
    const draft: RecipeDraft = {
      product: form.product.item!,
      type: form.type,
      variant: form.variant,
      output: parseWhole(form.output),
      notes: form.notes,
      inputs: usedRows.map((r) => ({ item: r.item.item!, quantity: parseWhole(r.quantity) })),
    };
    const result = await action.run((d) => saveRecipe(d, draft, { original, existingLabel }));
    if (result.status === "refused") {
      setProblems(result.reason);
      if (result.reason.some((p) => p.kind === "existingNeedsLabel")) {
        setExistingLabel((l) => l ?? "");
      }
    } else if (result.status === "saved") {
      onSaved(again);
    }
  };

  const combine = () => {
    const combined = combineDuplicateInputs(usedRows.map((row) => ({ item: row.item.item!, quantity: parseWhole(row.quantity), row })));
    update({ rows: combined.map((c) => ({ ...c.row, quantity: String(c.quantity) })) });
    setProblems((ps) => ps.filter((p) => p.kind !== "duplicateInput"));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void save(false);
  };

  const existingRecipe = problems.find((p) => p.kind === "existingNeedsLabel")?.existing ?? existingNeeded(data, form);

  return (
    <form className="recipe-form" aria-label={original ? `Edit recipe ${recipeName(original)}` : "New recipe"} onSubmit={submit}>
      <h2>{original ? `Edit recipe: ${recipeName(original)}` : "New recipe"}</h2>
      <div className="form-grid">
        <span className="label">Product</span>
        <div>
          <ItemField
            label="Product"
            value={form.product}
            onChange={choose}
            invalid={unresolved.has("product") && form.product.text !== "" ? true : at("product").length > 0}
            autoFocus={!original}
          />
          <Unresolved show={unresolved.has("product") && form.product.text !== ""} />
          <Problems list={at("product")} />
        </div>

        <label htmlFor="recipe-type">Type</label>
        <div>
          <select id="recipe-type" value={form.type} onChange={(e) => update({ type: e.target.value as RecipeType })}>
            {RECIPE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <Problems list={at("type")} />
        </div>

        <label htmlFor="recipe-variant">Variant label</label>
        <div>
          <input
            id="recipe-variant"
            value={form.variant}
            placeholder={form.type === "T2 Manufacturing" ? "e.g. the decryptor used" : "optional"}
            aria-invalid={at("variant").length > 0 || undefined}
            onChange={(e) => update({ variant: e.target.value })}
          />
          <Problems list={at("variant")} />
        </div>

        {existingLabel !== undefined && existingRecipe && (
          <>
            <label htmlFor="recipe-existing-label">Label for the existing recipe</label>
            <div>
              <input
                id="recipe-existing-label"
                value={existingLabel}
                autoFocus
                aria-invalid={at("existingLabel").length > 0 || undefined}
                onChange={(e) => setExistingLabel(e.target.value)}
              />
              <p className="hint">
                {existingRecipe.product} already has a recipe with no label. Now that there will be two, both need one, so they can be told
                apart. Both are saved together.
              </p>
              <Problems list={at("existingLabel").filter((p) => p.kind !== "existingNeedsLabel")} />
            </div>
          </>
        )}

        <label htmlFor="recipe-output">Output per run</label>
        <div>
          <input
            id="recipe-output"
            className="quantity"
            inputMode="numeric"
            value={form.output}
            aria-invalid={at("output").length > 0 || undefined}
            onChange={(e) => update({ output: e.target.value })}
          />
          <Problems list={at("output")} />
        </div>
      </div>

      <h3>Inputs per run</h3>
      <table className="grid inputs">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Quantity</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {form.rows.map((r, i) => {
            const rowProblems = at(r.key);
            const blank = isBlank(r);
            const label = `Input ${i + 1}`;
            return (
              <tr key={r.key}>
                <td>
                  <ItemField
                    label={label}
                    placeholder={blank ? "Add an input…" : undefined}
                    value={r.item}
                    onChange={(item) => updateRow(r.key, { item })}
                    invalid={unresolved.has(r.key) || rowProblems.length > 0}
                  />
                  <Unresolved show={unresolved.has(r.key)} />
                  <Problems list={rowProblems} onCombine={combine} />
                </td>
                <td className="num">
                  <input
                    className="quantity"
                    inputMode="numeric"
                    aria-label={`Quantity of ${label}`}
                    value={r.quantity}
                    onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                  />
                </td>
                <td>
                  {!blank && (
                    <button
                      type="button"
                      className="link"
                      aria-label={`Remove ${label}`}
                      onClick={() => update({ rows: form.rows.filter((x) => x.key !== r.key) })}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Problems list={at("inputs")} />

      <label className="notes">
        Notes
        <textarea rows={2} value={form.notes} onChange={(e) => update({ notes: e.target.value })} />
      </label>

      <div className="actions">
        <button type="submit" disabled={unresolved.size > 0 || action.pending}>
          Save
        </button>
        {!original && (
          <button type="button" disabled={unresolved.size > 0 || action.pending} onClick={() => void save(true)}>
            Save and enter another
          </button>
        )}
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        {unresolved.size > 0 && (form.product.text !== "" || usedRows.length > 0) && (
          <span className="muted">
            {unresolved.has("product") && form.product.text === ""
              ? "Choose the product to save."
              : "Every name must be an item before saving - the marked fields are not yet."}
          </span>
        )}
      </div>
      <Failure action={action} />
    </form>
  );
}

function Unresolved({ show }: { show: boolean }) {
  return show ? <div className="field-problem">Not an item yet: choose a suggestion, or create it.</div> : null;
}

function Problems({ list, onCombine }: { list: RecipeProblem[]; onCombine?: () => void }) {
  if (list.length === 0) {
    return null;
  }
  return (
    <>
      {list.map((p, i) => (
        <div key={i} className="field-problem" role="alert">
          {describe(p)}
          {p.kind === "duplicateInput" && p.total !== undefined && onCombine && (
            <>
              {" "}
              <button type="button" className="link" onClick={onCombine}>
                Combine into one row ({p.total})
              </button>
            </>
          )}
        </div>
      ))}
    </>
  );
}

function describe(p: RecipeProblem): ReactNode {
  switch (p.kind) {
    case "unknownItem":
      return `"${p.item}" is not an item.`;
    case "notPositiveWhole":
      return p.field === "output"
        ? "The output must be a whole number of at least 1."
        : "The quantity must be a whole number of at least 1.";
    case "noInputs":
      return "A recipe must consume at least one item.";
    case "duplicateInput":
      return `"${p.item}" is listed more than once.`;
    case "consumesItself":
      return "A recipe cannot consume its own product.";
    case "mixedTypes":
      return `All recipes for one product must be of the same type, and ${recipeName(p.existing)} is ${p.existingType}.`;
    case "onlyT2MayHaveSeveral":
      return `There is already a recipe for ${p.existing.product}: ${recipeName(p.existing)}. Only T2 Manufacturing products may have more than one.`;
    case "labelNeeded":
      return "This product has other T2 recipes, so this one needs a variant label of its own.";
    case "labelNotDistinct":
      return `"${p.label}" is already used; each variant needs its own distinct label.`;
    case "existingNeedsLabel":
      return `${recipeName(p.existing)} has no label yet.`;
    case "cycle":
      return `This would make a circle, where something is needed to make itself: ${p.chain.join(" → ")}.`;
    case "targetedByPlans":
      return `Open plans build this recipe's product (${p.plans.join(", ")}). Complete or delete them before changing the product.`;
    case "notFound":
      return "This recipe no longer exists; it may have been deleted.";
  }
}

function initialState(data: AppData, original: RecipeRef | undefined): FormState {
  const recipe = original && data.recipes.find((r) => r.product === original.product && r.variant === original.variant);
  if (!recipe) {
    return { product: { text: "" }, type: "T1 Manufacturing", variant: "", output: "1", notes: "", rows: [newRow()] };
  }
  return {
    product: { text: recipe.product, item: recipe.product },
    type: recipe.type,
    variant: recipe.variant ?? "",
    output: String(recipe.output),
    notes: recipe.notes ?? "",
    rows: [...[...recipe.inputs].map(([item, quantity]) => newRow({ text: item, item }, String(quantity))), newRow()],
  };
}

/** The product's one unlabelled T2 recipe, if saving this form would need it labelled. */
function existingNeeded(data: AppData, form: FormState): RecipeRef | undefined {
  const siblings = data.recipes.filter((r) => r.product === form.product.item);
  return siblings.length === 1 && siblings[0]!.variant === undefined ? siblings[0] : undefined;
}

function isBlank(row: Row | undefined): boolean {
  return row !== undefined && row.item.text.trim() === "" && row.quantity.trim() === "";
}

/** "10,000" or "10000" as 10000; anything else as NaN, which the save reports at the field. */
function parseWhole(text: string): number {
  const compact = text.replace(/[\s,]/g, "");
  return /^\d+$/.test(compact) ? Number(compact) : Number.NaN;
}
