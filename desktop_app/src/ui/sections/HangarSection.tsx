import { useState, type FormEvent } from "react";
import { compareNames } from "../../core/data/names";
import { pasteStock, type PasteSummary } from "../../core/hangar/paste";
import { hangarRows, removeStock, setAvailable, type HangarRow, type StockRefusal } from "../../core/hangar/stock";
import { releaseReservation, type ReservationRefusal } from "../../core/plans/reservations";
import { useAction, useAppData, useConfirm } from "../context";
import { Failure } from "../Failure";
import { formatQuantity } from "../format";

/** Filter values that cannot clash with a category name, since names never start with a space. */
const ANY = "";
const NONE = " none";

export function HangarSection() {
  const data = useAppData();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ANY);
  const [pasting, setPasting] = useState(false);
  const [summary, setSummary] = useState<PasteSummary>();

  const categories = [...data.items.categories.keys()].sort(compareNames);
  const categoryFilter = category === ANY || category === NONE || data.items.categories.has(category) ? category : ANY;
  const needle = search.trim().toLowerCase();
  const all = hangarRows(data);
  const rows = all
    .filter((r) => r.item.toLowerCase().includes(needle))
    .filter((r) => categoryFilter === ANY || (categoryFilter === NONE ? r.category === undefined : r.category === categoryFilter));

  return (
    <section aria-label="Hangar">
      <h1>Hangar</h1>
      <div className="toolbar">
        <button type="button" onClick={() => setPasting(true)} disabled={pasting}>
          Paste stock
        </button>
        <input
          type="search"
          placeholder="Search items"
          aria-label="Search stock"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select aria-label="Filter stock by category" value={categoryFilter} onChange={(e) => setCategory(e.target.value)}>
          <option value={ANY}>All categories</option>
          <option value={NONE}>(no category)</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {pasting && (
        <PastePanel
          onDone={(s) => {
            setPasting(false);
            setSummary(s);
          }}
          onCancel={() => setPasting(false)}
        />
      )}
      {summary && <PasteSummaryPanel summary={summary} onDismiss={() => setSummary(undefined)} />}

      {rows.length > 0 ? (
        <table className="grid">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th className="num">Available</th>
              <th className="num">Reserved</th>
              <th className="num">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <StockRow key={r.item} row={r} />
            ))}
          </tbody>
        </table>
      ) : (
        <p>
          {all.length > 0
            ? "No item matches."
            : 'The hangar is empty. Paste the contents of an inventory or assets window from the game to add stock - or type a line such as "Tritanium 500".'}
        </p>
      )}
    </section>
  );
}

function PastePanel({ onDone, onCancel }: { onDone: (summary: PasteSummary) => void; onCancel: () => void }) {
  const action = useAction<never>();
  const [text, setText] = useState("");

  const add = async (e: FormEvent) => {
    e.preventDefault();
    let summary: PasteSummary | undefined;
    const result = await action.run((d) => {
      const pasted = pasteStock(d, text);
      summary = pasted.summary;
      return pasted.data;
    });
    if (result.status === "saved" && summary) {
      onDone(summary);
    }
  };

  return (
    <form className="panel-box" aria-label="Paste stock" onSubmit={(e) => void add(e)}>
      <p>
        Copy the contents of an inventory or assets window in the game (select all, then copy) and paste them here. The quantities are{" "}
        <strong>added</strong> to the stock already held. Only items some recipe uses are kept.
      </p>
      <textarea
        aria-label="Pasted text"
        rows={10}
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <div className="actions">
        <button type="submit" disabled={text.trim() === "" || action.pending}>
          Add to hangar
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <Failure action={action} />
    </form>
  );
}

function PasteSummaryPanel({ summary, onDismiss }: { summary: PasteSummary; onDismiss: () => void }) {
  const reason = { notAnItem: "not relevant for industry", notUsedByRecipe: "no recipe uses it" } as const;
  return (
    <section className="panel-box" role="status" aria-label="Paste summary">
      <h2>
        Added {summary.added.length} {summary.added.length === 1 ? "item" : "items"}
        {summary.ignored.length > 0 && `, ignored ${summary.ignored.length}`}
        {summary.skipped.length > 0 && `, skipped ${summary.skipped.length} ${summary.skipped.length === 1 ? "line" : "lines"}`}
      </h2>
      <div className="summary-columns">
        {summary.added.length > 0 && (
          <div>
            <h3>Added</h3>
            <table className="grid">
              <tbody>
                {summary.added.map((a) => (
                  <tr key={a.item}>
                    <td>{a.item}</td>
                    <td className="num">+{formatQuantity(a.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {summary.ignored.length > 0 && (
          <div>
            <h3>Ignored</h3>
            <table className="grid">
              <tbody>
                {summary.ignored.map((i) => (
                  <tr key={i.name}>
                    <td>{i.name}</td>
                    <td className="num">{formatQuantity(i.quantity)}</td>
                    <td className="muted">{reason[i.reason]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {summary.skipped.length > 0 && (
          <div>
            <h3>Skipped - no quantity found</h3>
            <ul className="skipped-lines">
              {summary.skipped.map((line, i) => (
                <li key={i}>
                  <code>{line}</code>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="actions">
        <button type="button" onClick={onDismiss}>
          OK
        </button>
      </div>
    </section>
  );
}

function StockRow({ row }: { row: HangarRow }) {
  const confirm = useConfirm();
  const action = useAction<StockRefusal | ReservationRefusal>();
  const [editing, setEditing] = useState<string>();
  const [showReserved, setShowReserved] = useState(false);
  const [refusal, setRefusal] = useState<StockRefusal | ReservationRefusal>();
  const { item } = row;

  const run = async (change: Parameters<typeof action.run>[0]) => {
    const result = await action.run(change);
    setRefusal(result.status === "refused" ? result.reason : undefined);
    return result.status === "saved";
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const quantity = parseWhole(editing ?? "");
    if (await run((d) => setAvailable(d, item, quantity))) {
      setEditing(undefined);
    }
  };

  const remove = async () => {
    const confirmed = await confirm({
      title: `Remove ${item} from the hangar?`,
      consequences: [
        `The ${formatQuantity(row.available)} ${item} available are removed.`,
        ...(row.reserved > 0 ? [`The ${formatQuantity(row.reserved)} reserved by plans stay with them.`] : []),
      ],
      confirmLabel: "Remove stock",
    });
    if (confirmed) {
      await run((d) => removeStock(d, item));
    }
  };

  return (
    <>
      <tr>
        <td>
          {item}
          {!row.usedByRecipes && <span className="tag">not used by any recipe</span>}
        </td>
        <td>{row.category}</td>
        <td className="num">
          {editing === undefined ? (
            formatQuantity(row.available)
          ) : (
            <form className="inline-form" onSubmit={(e) => void save(e)}>
              <input
                className="quantity"
                inputMode="numeric"
                aria-label={`Available ${item}`}
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
            </form>
          )}
        </td>
        <td className="num">
          {row.reserved > 0 ? (
            <button
              type="button"
              className="link"
              aria-label={`Reserved ${item}`}
              aria-expanded={showReserved}
              onClick={() => setShowReserved((s) => !s)}
            >
              {formatQuantity(row.reserved)}
            </button>
          ) : (
            ""
          )}
        </td>
        <td className="num">{formatQuantity(row.total)}</td>
        <td className="row-actions">
          {editing === undefined && (
            <button type="button" className="link" aria-label={`Correct ${item}`} onClick={() => setEditing(String(row.available))}>
              Correct
            </button>
          )}
          {row.available > 0 && (
            <button type="button" className="link" aria-label={`Remove ${item}`} disabled={action.pending} onClick={() => void remove()}>
              Remove
            </button>
          )}
        </td>
      </tr>
      {showReserved && row.reserved > 0 && (
        <tr className="detail-row">
          <td colSpan={6}>
            Reserved material cannot be edited here; release the reservation first, which returns the plan&apos;s whole pile to general
            stock.
            <ul>
              {row.reservedBy.map((r) => (
                <li key={r.index}>
                  {formatQuantity(r.quantity)} reserved by <strong>{r.plan}</strong>{" "}
                  <button
                    type="button"
                    className="link"
                    disabled={action.pending}
                    onClick={() => void run((d) => releaseReservation(d, { index: r.index, name: r.plan }))}
                  >
                    Release {r.plan}&apos;s reservation
                  </button>
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
      {(refusal || action.failure || action.warning) && (
        <tr>
          <td colSpan={6}>
            {refusal && (
              <span className="failure" role="alert">
                {describe(refusal)}
              </span>
            )}
            <Failure action={action} />
          </td>
        </tr>
      )}
    </>
  );
}

function describe(r: StockRefusal | ReservationRefusal): string {
  switch (r.kind) {
    case "notWholeNumber":
      return "Enter a whole number of 0 or more.";
    case "notAnItem":
      return `"${r.item}" is no longer an item.`;
    case "planNotFound":
      return `The plan "${r.plan}" no longer exists.`;
    case "notReserved":
      return `The plan "${r.plan}" no longer holds a reservation.`;
  }
}

/** "10,000" or "10000" as 10000; anything else as NaN, which the action refuses. */
function parseWhole(text: string): number {
  const compact = text.replace(/[\s,.]/g, "");
  return /^\d+$/.test(compact) ? Number(compact) : Number.NaN;
}
