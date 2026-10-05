import { useState, type FormEvent } from "react";
import type { Change } from "../../app/store";
import {
  createCategory,
  deleteCategory,
  moveItemsOutOfCategory,
  renameCategory,
  type CategoryRefusal,
} from "../../core/catalog/categories";
import { compareNames } from "../../core/data/names";
import { useAction, useAppData } from "../context";
import { Failure } from "../Failure";

function describeCategoryRefusal(r: CategoryRefusal): string {
  switch (r.kind) {
    case "empty":
      return "A category needs a name.";
    case "duplicate":
      return `There is already a category called "${r.existing}".`;
    case "inUse":
      return `${r.count === 1 ? "1 item belongs" : `${r.count} items belong`} to "${r.category}", so it cannot be deleted.`;
    case "notFound":
      return `The category "${r.category}" no longer exists.`;
  }
}

export function CategoriesPanel() {
  const data = useAppData();
  const names = [...data.items.categories.keys()].sort(compareNames);

  return (
    <div className="categories">
      <h2>Categories</h2>
      <NewCategory />
      <table className="grid">
        <thead>
          <tr>
            <th>Category</th>
            <th className="num">Items</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {names.map((name) => (
            <CategoryRow key={name} name={name} count={data.items.categories.get(name)!.length} />
          ))}
          <tr className="muted">
            <td>(no category)</td>
            <td className="num">{data.items.uncategorised.length}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function NewCategory() {
  const action = useAction<CategoryRefusal>();
  const [name, setName] = useState("");
  const [refusal, setRefusal] = useState<CategoryRefusal>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await action.run((d) => createCategory(d, name));
    setRefusal(result.status === "refused" ? result.reason : undefined);
    if (result.status === "saved") {
      setName("");
    }
  };

  return (
    <form className="toolbar" onSubmit={(e) => void submit(e)}>
      <input aria-label="New category" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" disabled={action.pending}>
        Create
      </button>
      {refusal && (
        <span className="failure" role="alert">
          {describeCategoryRefusal(refusal)}
        </span>
      )}
      <Failure action={action} />
    </form>
  );
}

function CategoryRow({ name, count }: { name: string; count: number }) {
  const action = useAction<CategoryRefusal>();
  const [editing, setEditing] = useState<string>();
  const [refusal, setRefusal] = useState<CategoryRefusal>();

  const run = async (c: Change<CategoryRefusal>) => {
    const result = await action.run(c);
    setRefusal(result.status === "refused" ? result.reason : undefined);
    return result.status === "saved";
  };

  const rename = async (e: FormEvent) => {
    e.preventDefault();
    if (await run((d) => renameCategory(d, name, editing ?? name))) {
      setEditing(undefined);
    }
  };

  const problem = (refusal || action.failure || action.warning) && (
    <tr>
      <td colSpan={3}>
        {refusal && (
          <span className="failure" role="alert">
            {describeCategoryRefusal(refusal)}{" "}
            {refusal.kind === "inUse" && (
              <button type="button" className="link" onClick={() => void run((d) => moveItemsOutOfCategory(d, name))}>
                Move {refusal.count === 1 ? "it" : "them"} to no category
              </button>
            )}
          </span>
        )}
        <Failure action={action} />
      </td>
    </tr>
  );

  return (
    <>
      <tr>
        {editing === undefined ? (
          <>
            <td>{name}</td>
            <td className="num">{count}</td>
            <td className="row-actions">
              <button type="button" className="link" onClick={() => setEditing(name)} aria-label={`Rename ${name}`}>
                Rename
              </button>
              <button type="button" className="link" onClick={() => void run((d) => deleteCategory(d, name))} aria-label={`Delete ${name}`}>
                Delete
              </button>
            </td>
          </>
        ) : (
          <td colSpan={3}>
            <form className="inline-form" onSubmit={(e) => void rename(e)}>
              <input
                aria-label={`New name for ${name}`}
                value={editing}
                autoFocus
                onChange={(e) => setEditing(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setEditing(undefined);
                    setRefusal(undefined);
                  }
                }}
              />
              <button type="submit" disabled={action.pending}>
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(undefined);
                  setRefusal(undefined);
                }}
              >
                Cancel
              </button>
            </form>
          </td>
        )}
      </tr>
      {problem}
    </>
  );
}
