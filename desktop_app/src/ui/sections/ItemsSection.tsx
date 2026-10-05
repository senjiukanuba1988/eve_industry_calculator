import { useState, type FormEvent } from "react";
import type { Change } from "../../app/store";
import { deleteItem, listItems, renameItem, setItemCategory, type ItemEntry, type ItemRefusal } from "../../core/catalog/items";
import { compareNames } from "../../core/data/names";
import { useAction, useAppData } from "../context";
import { Failure } from "../Failure";
import { formatQuantity, recipeName } from "../format";
import { CategoriesPanel } from "./CategoriesPanel";

/** Filter values that cannot clash with a category name, since names never start with a space. */
const ALL = "";
const NONE = " none";

function describeItemRefusal(r: ItemRefusal): string {
  switch (r.kind) {
    case "empty":
      return "An item needs a name.";
    case "duplicate":
      return `There is already an item called "${r.existing}".`;
    case "notFound":
      return `The item "${r.item}" no longer exists.`;
    case "categoryNotFound":
      return `The category "${r.category}" no longer exists.`;
    case "usedByRecipes":
      return `"${r.item}" cannot be deleted: ${r.recipes.length === 1 ? "a recipe uses it" : `${r.recipes.length} recipes use it`} - ${r.recipes.map(recipeName).join(", ")}.`;
    case "holdsStock":
      return `"${r.item}" cannot be deleted: ${formatQuantity(r.quantity)} of it is in the hangar. Remove its stock in the Hangar section first.`;
  }
}

export function ItemsSection() {
  const data = useAppData();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const needle = search.trim().toLowerCase();
  const categories = [...data.items.categories.keys()].sort(compareNames);
  // A category deleted or renamed while selected shows everything rather than nothing.
  const filter = category === ALL || category === NONE || data.items.categories.has(category) ? category : ALL;

  const rows = listItems(data.items)
    .filter((i) => i.name.toLowerCase().includes(needle))
    .filter((i) => filter === ALL || (filter === NONE ? i.category === undefined : i.category === filter))
    .sort((a, b) => compareNames(a.name, b.name));

  return (
    <section aria-label="Items">
      <h1>Items</h1>
      <div className="items-layout">
        <CategoriesPanel />
        <div>
          <h2>Items</h2>
          <div className="toolbar">
            <input
              type="search"
              placeholder="Search items"
              aria-label="Search items"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select aria-label="Filter by category" value={filter} onChange={(e) => setCategory(e.target.value)}>
              <option value={ALL}>All categories</option>
              <option value={NONE}>(no category)</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {rows.length > 0 ? (
            <table className="grid">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Category</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ItemRow key={r.name} entry={r} categories={categories} />
                ))}
              </tbody>
            </table>
          ) : (
            <p>{needle || filter !== ALL ? "No item matches." : "No items yet. Items are created while entering recipes."}</p>
          )}
        </div>
      </div>
    </section>
  );
}

function ItemRow({ entry, categories }: { entry: ItemEntry; categories: string[] }) {
  const action = useAction<ItemRefusal>();
  const [editing, setEditing] = useState<string>();
  const [refusal, setRefusal] = useState<ItemRefusal>();
  const { name } = entry;

  const run = async (c: Change<ItemRefusal>) => {
    const result = await action.run(c);
    setRefusal(result.status === "refused" ? result.reason : undefined);
    return result.status === "saved";
  };

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (await run((d) => renameItem(d, name, editing ?? name))) {
      setEditing(undefined);
    }
  };

  const stopEditing = () => {
    setEditing(undefined);
    setRefusal(undefined);
  };

  return (
    <>
      <tr>
        {editing === undefined ? (
          <td>{name}</td>
        ) : (
          <td>
            <form className="inline-form" onSubmit={(e) => void rename(e)}>
              <input
                aria-label={`New name for ${name}`}
                value={editing}
                size={Math.max(20, editing.length + 2)}
                autoFocus
                onChange={(e) => setEditing(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && stopEditing()}
              />
              <button type="submit" disabled={action.pending}>
                Save
              </button>
              <button type="button" onClick={stopEditing}>
                Cancel
              </button>
            </form>
          </td>
        )}
        <td>
          <select
            aria-label={`Category of ${name}`}
            value={entry.category ?? NONE}
            disabled={action.pending}
            onChange={(e) => {
              // Read the choice now: the change runs later, and by then React has reset the select.
              const category = e.target.value === NONE ? undefined : e.target.value;
              void run((d) => setItemCategory(d, name, category));
            }}
          >
            <option value={NONE}>(no category)</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </td>
        <td className="row-actions">
          <button type="button" className="link" onClick={() => setEditing(name)} aria-label={`Rename ${name}`}>
            Rename
          </button>
          <button type="button" className="link" onClick={() => void run((d) => deleteItem(d, name))} aria-label={`Delete ${name}`}>
            Delete
          </button>
        </td>
      </tr>
      {(refusal || action.failure || action.warning) && (
        <tr>
          <td colSpan={3}>
            {refusal && (
              <span className="failure" role="alert">
                {describeItemRefusal(refusal)}
              </span>
            )}
            <Failure action={action} />
          </td>
        </tr>
      )}
    </>
  );
}
