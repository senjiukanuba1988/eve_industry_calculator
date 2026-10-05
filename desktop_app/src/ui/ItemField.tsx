// The item-name field used wherever an item is entered (recipe-library spec, "Entering
// item names with autocomplete"): suggestions while typing, each with its category; choosing
// one binds the field to that item; a name nothing matches can be created on the spot.

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { createItem, findItem, suggestItems, type ItemRefusal } from "../core/catalog/items";
import { compareNames } from "../core/data/names";
import { useAction, useAppData } from "./context";
import { Failure } from "./Failure";

/** What the field holds: the text typed, and the item it is bound to, if any. */
export interface ItemFieldValue {
  text: string;
  /** The catalog item, spelt as in the catalog. Absent while the text names no item. */
  item?: string;
}

interface ItemFieldProps {
  value: ItemFieldValue;
  onChange: (value: ItemFieldValue) => void;
  /** Accessible name, e.g. "Product" or "Input 3". */
  label: string;
  placeholder?: string;
  /** Marks the field as at fault, e.g. unresolved when saving. */
  invalid?: boolean;
  autoFocus?: boolean;
}

type Option = { kind: "item"; name: string; category?: string } | { kind: "create"; name: string };

export function ItemField({ value, onChange, label, placeholder, invalid, autoFocus }: ItemFieldProps) {
  const data = useAppData();
  const listId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [creating, setCreating] = useState<string>();

  const text = value.text.trim();
  const options: Option[] = suggestItems(data.items, text).map((i) => ({ kind: "item", ...i }));
  if (text !== "" && findItem(data.items, text) === undefined) {
    options.push({ kind: "create", name: text });
  }
  const showList = open && options.length > 0 && creating === undefined;
  const highlighted = Math.min(active, options.length - 1);

  const type = (newText: string) => {
    // Binding follows the text: typing an existing name exactly, in any case, binds to it.
    onChange({ text: newText, item: findItem(data.items, newText) });
    setOpen(true);
    setActive(0);
  };

  const choose = (option: Option) => {
    if (option.kind === "item") {
      onChange({ text: option.name, item: option.name });
      setOpen(false);
    } else {
      setCreating(option.name);
    }
  };

  const keyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!showList) {
        setOpen(true);
        setActive(0);
      } else {
        setActive((highlighted + 1) % options.length);
      }
    } else if (e.key === "ArrowUp" && showList) {
      e.preventDefault();
      setActive((highlighted - 1 + options.length) % options.length);
    } else if (e.key === "Enter" && showList) {
      // Choosing must not also submit the form the field sits in.
      e.preventDefault();
      choose(options[highlighted]!);
    } else if (e.key === "Escape" && showList) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  };

  const created = (name: string) => {
    setCreating(undefined);
    setOpen(false);
    onChange({ text: name, item: name });
    input.current?.focus();
  };

  return (
    <div className="item-field" data-bound={value.item !== undefined || undefined}>
      <input
        ref={input}
        role="combobox"
        aria-label={label}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${highlighted}` : undefined}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
        value={value.text}
        onChange={(e) => type(e.target.value)}
        onKeyDown={keyDown}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {showList && (
        <ul className="item-suggestions" role="listbox" id={listId} aria-label={`Suggestions for ${label}`}>
          {options.map((o, i) => (
            <li
              key={`${o.kind}:${o.name}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlighted}
              // Keep the focus in the input, so the blur does not close the list before the click lands.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(o)}
            >
              {o.kind === "item" ? (
                <>
                  <span>{o.name}</span>
                  <span className="muted">{o.category ?? ""}</span>
                </>
              ) : (
                <span>
                  Create item <strong>{o.name}</strong>…
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {creating !== undefined && (
        <CreateItem
          name={creating}
          onCreated={created}
          onCancel={() => {
            setCreating(undefined);
            input.current?.focus();
          }}
        />
      )}
    </div>
  );
}

const NO_CATEGORY = " none";

/** Creates an item without leaving the form: the name as typed, and a category or none. */
function CreateItem({ name, onCreated, onCancel }: { name: string; onCreated: (name: string) => void; onCancel: () => void }) {
  const data = useAppData();
  const action = useAction<ItemRefusal>();
  const [category, setCategory] = useState(NO_CATEGORY);
  const [refusal, setRefusal] = useState<ItemRefusal>();
  const categories = [...data.items.categories.keys()].sort(compareNames);

  const create = async () => {
    const chosen = category === NO_CATEGORY ? undefined : category;
    const result = await action.run((d) => createItem(d, name, chosen));
    if (result.status === "saved") {
      onCreated(name);
    } else {
      setRefusal(result.status === "refused" ? result.reason : undefined);
    }
  };

  const keys = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void create();
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div className="item-create" role="group" aria-label={`Create item ${name}`} onKeyDown={keys}>
      <span>
        New item <strong>{name}</strong> in
      </span>
      <select aria-label="Category for the new item" value={category} autoFocus onChange={(e) => setCategory(e.target.value)}>
        <option value={NO_CATEGORY}>(no category)</option>
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <button type="button" disabled={action.pending} onClick={() => void create()}>
        Create
      </button>
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      {refusal && (
        <span className="failure" role="alert">
          {refusal.kind === "duplicate"
            ? `There is already an item called "${refusal.existing}".`
            : `The item could not be created (${refusal.kind}).`}
        </span>
      )}
      <Failure action={action} />
    </div>
  );
}
