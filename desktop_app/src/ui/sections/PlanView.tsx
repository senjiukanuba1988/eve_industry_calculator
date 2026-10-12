import { useState, type FormEvent, type ReactNode } from "react";
import type { BuildEntry, ItemTrace } from "../../core/calculation/calculate";
import type { Plan, PlanStep, Quantities, RecipeRef } from "../../core/data/model";
import { compareNames } from "../../core/data/names";
import {
  calculatePlan,
  planAt,
  removalDate,
  renamePlan,
  setVariantChoice,
  variantOptions,
  type PlanAt,
  type PlanRefusal,
} from "../../core/plans/plans";
import { releaseReservation, reservePlan, type ReservationRefusal } from "../../core/plans/reservations";
import { useAction, useAppData, useConfirm, useGoTo } from "../context";
import { Failure } from "../Failure";
import { formatQuantity, formatTime, recipeName } from "../format";
import { useDeletePlan } from "./deletePlan";
import { DeletePlanProblem } from "./DeletePlanProblem";
import { useStepActions, type StepActions } from "./stepActions";

interface PlanViewProps {
  at: PlanAt;
  /** The plan's name changed, so the way to find it did too. */
  onAtChange: (at: PlanAt) => void;
  onClose: () => void;
}

/**
 * One plan: what it builds, the checklist of outstanding work (Acquire entries first, then
 * build entries in dependency order with the target last), the recipe choices it has, and
 * its completed steps folded away. Recalculated from the current data on every render.
 */
export function PlanView({ at, onAtChange, onClose }: PlanViewProps) {
  const data = useAppData();
  const plan = planAt(data, at);
  const remove = useDeletePlan();
  const steps = useStepActions(at);

  if (!plan) {
    return (
      <div>
        <p>This plan no longer exists.</p>
        <button type="button" onClick={onClose}>
          Back to plans
        </button>
      </div>
    );
  }

  const output = data.recipes.find((r) => r.product === plan.target.product && r.variant === plan.target.variant)?.output;
  const done = plan.steps.map((step, index) => ({ step, index })).filter(({ step }) => step.state === "done");

  return (
    <div className="plan-view">
      <div className="toolbar">
        <button type="button" className="link" onClick={onClose}>
          &larr; Plans
        </button>
      </div>
      <PlanName plan={plan} at={at} onAtChange={onAtChange} />
      <p className="plan-meta">
        <span>
          Builds {recipeName(plan.target)}: {formatQuantity(plan.runs)} {plan.runs === 1 ? "run" : "runs"}
          {output !== undefined && (
            <>
              {" "}
              = {formatQuantity(plan.runs * output)} {plan.target.product}
            </>
          )}
        </span>
        <span>Created {formatTime(plan.created)}</span>
        {plan.completed ? (
          <span>
            Completed {formatTime(plan.completed)}, removed on {removalDate(plan.completed)}
          </span>
        ) : (
          <Reservation plan={plan} at={at} />
        )}
        <button
          type="button"
          className="link"
          disabled={remove.pending}
          onClick={() => void remove.run(plan, at).then((deleted) => deleted && onClose())}
        >
          Delete plan
        </button>
      </p>
      <DeletePlanProblem remove={remove} />

      <StepProblem steps={steps} />
      {plan.completed === undefined && <Outstanding plan={plan} at={at} steps={steps} />}

      {plan.reserved && plan.reserved.size > 0 && (
        <details className="done-steps">
          <summary>Reserved materials ({plan.reserved.size})</summary>
          <table className="grid">
            <tbody>
              {[...plan.reserved].sort(([a], [b]) => compareNames(a, b)).map(([item, quantity]) => (
                <tr key={item}>
                  <td>{item}</td>
                  <td className="num">{formatQuantity(quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {done.length > 0 && (
        <details className="done-steps" open={plan.completed !== undefined}>
          <summary>Completed steps ({done.length})</summary>
          <DoneSteps done={done} steps={plan.completed === undefined ? steps : undefined} />
        </details>
      )}
    </div>
  );
}

/** Reserving the plan's materials, all or nothing, and releasing them again. */
function Reservation({ plan, at }: { plan: Plan; at: PlanAt }) {
  const action = useAction<ReservationRefusal>();
  const [refusal, setRefusal] = useState<ReservationRefusal>();
  const run = async (change: Parameters<typeof action.run>[0]) => {
    const result = await action.run(change);
    setRefusal(result.status === "refused" ? result.reason : undefined);
  };
  return (
    <span>
      {plan.reserved ? "Materials reserved " : "Not reserved "}
      {plan.reserved ? (
        <button type="button" className="link" disabled={action.pending} onClick={() => void run((d) => releaseReservation(d, at))}>
          Release
        </button>
      ) : (
        <button type="button" className="link" disabled={action.pending} onClick={() => void run((d) => reservePlan(d, at))}>
          Reserve materials
        </button>
      )}
      {refusal && (
        <span className="failure" role="alert">
          {" "}
          {refusal.kind === "missing"
            ? `Cannot reserve yet - still to acquire: ${refusal.missing.map((m) => `${formatQuantity(m.quantity)} ${m.item}`).join(", ")}.`
            : refusal.kind === "choicesNeeded"
              ? `Choose a recipe for ${refusal.products.join(", ")} first.`
              : "The reservation could not be changed."}
        </span>
      )}
      <Failure action={action} />
    </span>
  );
}

function PlanName({ plan, at, onAtChange }: { plan: Plan; at: PlanAt; onAtChange: (at: PlanAt) => void }) {
  const action = useAction<PlanRefusal>();
  const [editing, setEditing] = useState<string>();
  const [refusal, setRefusal] = useState<PlanRefusal>();

  if (editing === undefined) {
    return (
      <div className="plan-title">
        <h1>{plan.name}</h1>
        <button type="button" className="link" onClick={() => setEditing(plan.name)}>
          Rename
        </button>
      </div>
    );
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await action.run((d) => renamePlan(d, at, editing));
    setRefusal(result.status === "refused" ? result.reason : undefined);
    if (result.status === "saved") {
      setEditing(undefined);
      onAtChange({ index: at.index, name: editing.trim() });
    }
  };

  return (
    <form className="plan-title" onSubmit={(e) => void submit(e)}>
      <input
        aria-label="Plan name"
        value={editing}
        size={40}
        autoFocus
        onChange={(e) => setEditing(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && setEditing(undefined)}
      />
      <button type="submit" disabled={action.pending}>
        Save
      </button>
      <button type="button" onClick={() => setEditing(undefined)}>
        Cancel
      </button>
      {refusal && (
        <span className="field-problem">{refusal.kind === "nameEmpty" ? "A plan needs a name." : "This plan no longer exists."}</span>
      )}
      <Failure action={action} />
    </form>
  );
}

/** The part of an incomplete plan still to do, worked out afresh from the current data. */
function Outstanding({ plan, at, steps }: { plan: Plan; at: PlanAt; steps: StepActions }) {
  const data = useAppData();
  const result = calculatePlan(data, plan);
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (!next.delete(key)) {
        next.add(key);
      }
      return next;
    });

  if (!result.ok) {
    return <p className="failure">The recipe this plan builds, {recipeName(plan.target)}, no longer exists.</p>;
  }

  const source = plan.reserved ? "the plan's reserved pile" : "the hangar";
  const options = variantOptions(data, plan, result);
  const available = plan.reserved ?? data.hangar.stock;
  const covered = result.baseMaterials.filter((m) => m.toAcquire === 0);
  const columns = 8;

  return (
    <>
      {result.choicesNeeded.map((c) => (
        <VariantPrompt key={c.product} plan={plan} at={at} product={c.product} variants={c.variants} invalid={c.invalidChoice} still={c.stillNeeded} />
      ))}

      <table className="grid checklist">
        <thead>
          <tr>
            <th>Step</th>
            <th>Item</th>
            <th>Recipe</th>
            <th className="num">Runs</th>
            <th className="num">Quantity</th>
            <th className="num">Leftover</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {result.acquire.map((a) => {
            const key = `acquire ${a.item}`;
            return (
              <Row key={key} open={open.has(key)} columns={columns} why={<Why trace={result.trace.get(a.item)} source={source} />}>
                <td className="kind acquire">Acquire</td>
                <td>
                  <StockLink item={a.item} />
                </td>
                <td />
                <td />
                <td className="num">{formatQuantity(a.quantity)}</td>
                <td />
                <td className="muted">missing</td>
                <td className="row-actions">
                  <CreateRecipeLink item={a.item} />
                  <DetailsToggle item={a.item} open={open.has(key)} onToggle={() => toggle(key)} />
                </td>
              </Row>
            );
          })}
          {result.builds.map((b) => {
            const key = b.state === "started" ? `step ${b.step}` : `build ${b.product}`;
            const step = b.step === undefined ? undefined : plan.steps[b.step];
            return (
              <Row
                key={key}
                open={open.has(key)}
                columns={columns}
                why={<BuildWhy entry={b} step={step} trace={b.state === "notStarted" ? result.trace.get(b.product) : undefined} source={source} available={available} />}
              >
                <td className={b.isTarget ? "kind target" : "kind"}>{b.isTarget ? "Build target" : "Build"}</td>
                <td>
                  <StockLink item={b.product} />
                </td>
                <td>
                  <RecipeLink recipe={b.recipe} />
                </td>
                <td className="num">{formatQuantity(b.runs)}</td>
                <td className="num">{formatQuantity(b.output)}</td>
                <td className="num">{b.leftover > 0 ? formatQuantity(b.leftover) : ""}</td>
                <td>
                  {step ? (
                    <span className="status started">
                      started{step.started && ` ${formatTime(step.started)}`}
                      {step.short && <span className="failure"> - short {quantities(step.short)}</span>}
                      {step.notRemoved !== undefined && (
                        <span className="failure">
                          {" "}
                          - {formatQuantity(step.notRemoved)} of its output could not be removed on undo
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="muted">not started</span>
                  )}
                </td>
                <td className="row-actions">
                  {step ? (
                    <>
                      <button type="button" className="step-action" disabled={steps.pending} onClick={() => void steps.completeStarted(b.step!, step)}>
                        Done
                      </button>
                      <button type="button" className="link" disabled={steps.pending} onClick={() => void steps.undo(b.step!, step)}>
                        Undo start
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="step-action" disabled={steps.pending} onClick={() => void steps.start(b)}>
                        Start
                      </button>
                      <button type="button" className="link" disabled={steps.pending} onClick={() => void steps.completeNotStarted(b)}>
                        Done
                      </button>
                    </>
                  )}
                  <DetailsToggle item={b.product} open={open.has(key)} onToggle={() => toggle(key)} />
                </td>
              </Row>
            );
          })}
        </tbody>
      </table>

      {covered.length > 0 && (
        // Accounted for, though nothing is left to acquire (material-calculation spec, "Fully covered item").
        <details className="done-steps">
          <summary>Covered materials ({covered.length})</summary>
          <table className="grid" aria-label="Covered materials">
            <thead>
              <tr>
                <th>Material</th>
                <th className="num">Needed</th>
                <th>From</th>
              </tr>
            </thead>
            <tbody>
              {covered.map((m) => (
                <tr key={m.item}>
                  <td>
                    <StockLink item={m.item} />
                  </td>
                  <td className="num">{formatQuantity(m.needed)}</td>
                  <td>{source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {options.length > 0 && <VariantChoices plan={plan} at={at} options={options} />}
    </>
  );
}

function Row({ open, columns, why, children }: { open: boolean; columns: number; why: ReactNode; children: ReactNode }) {
  return (
    <>
      <tr>{children}</tr>
      {open && (
        <tr className="detail-row">
          <td colSpan={columns}>{why}</td>
        </tr>
      )}
    </>
  );
}

/** An item, opening its hangar position: available, reserved, and by which plans (application-shell spec, "From a material to its stock"). */
function StockLink({ item }: { item: string }) {
  const goTo = useGoTo();
  return (
    <button type="button" className="link" title="Show in the hangar" aria-label={`Hangar stock of ${item}`} onClick={() => goTo({ section: "hangar", item })}>
      {item}
    </button>
  );
}

/** The recipe behind a build step, opened for viewing or editing; plain text once it no longer exists. */
function RecipeLink({ recipe }: { recipe: RecipeRef }) {
  const data = useAppData();
  const goTo = useGoTo();
  if (!data.recipes.some((r) => r.product === recipe.product && r.variant === recipe.variant)) {
    return <>{recipe.variant}</>;
  }
  return (
    <button
      type="button"
      className="link"
      aria-label={`Open recipe ${recipeName(recipe)}`}
      onClick={() => goTo({ section: "recipes", open: recipe, fromPlan: true })}
    >
      {recipe.variant ?? "view"}
    </button>
  );
}

/** On a base material: a recipe the user has not entered yet looks just like one (item-catalog spec, "Missing recipes are visible"). */
function CreateRecipeLink({ item }: { item: string }) {
  const goTo = useGoTo();
  return (
    <button
      type="button"
      className="link"
      aria-label={`Create a recipe for ${item}`}
      onClick={() => goTo({ section: "recipes", open: "new", product: item, fromPlan: true })}
    >
      Create recipe
    </button>
  );
}

function DetailsToggle({ item, open, onToggle }: { item: string; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="link" aria-expanded={open} aria-label={`Details for ${item}`} onClick={onToggle}>
      {open ? "Hide details" : "Details"}
    </button>
  );
}

/** How an item's quantity comes about (material-calculation spec, "The calculation explains itself"). */
function Why({ trace, source }: { trace: ItemTrace | undefined; source: string }) {
  if (!trace) {
    return null;
  }
  const lines: string[] = [];
  if (trace.how === "target") {
    lines.push(`The plan's target: ${formatQuantity(trace.totalDemand)} ${trace.item}.`);
  } else {
    const from = trace.demandFrom.map((d) => `${formatQuantity(d.quantity)} for ${d.consumer}`).join(", ");
    lines.push(`Needed: ${formatQuantity(trace.totalDemand)} (${from}).`);
  }
  if (trace.fromAvailable > 0) {
    lines.push(`${formatQuantity(trace.fromAvailable)} from ${source}.`);
  }
  if (trace.onItsWay > 0) {
    lines.push(`${formatQuantity(trace.onItsWay)} on its way from started steps.`);
  }
  if (trace.how === "build" || trace.how === "target") {
    if (trace.runs) {
      lines.push(
        `${formatQuantity(trace.remaining)} to make: ${formatQuantity(trace.runs)} ${trace.runs === 1 ? "run" : "runs"} × ${formatQuantity(trace.outputPerRun!)} = ${formatQuantity(trace.produced!)}` +
          (trace.leftover ? `, ${formatQuantity(trace.leftover)} left over.` : "."),
      );
    } else {
      lines.push("Nothing left to make.");
    }
  } else if (trace.how === "acquire") {
    lines.push(trace.remaining > 0 ? `${formatQuantity(trace.remaining)} to acquire.` : "Fully covered.");
  } else {
    lines.push(`${formatQuantity(trace.remaining)} waiting for a recipe choice.`);
  }
  return (
    <ul>
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

/**
 * What a build step takes: its materials, per run and in total, and for a step not yet
 * started how much of each the plan can draw on right now - shared with its other steps.
 * A started step shows what was actually taken instead.
 */
function BuildWhy({
  entry,
  step,
  trace,
  source,
  available,
}: {
  entry: BuildEntry;
  step?: PlanStep;
  trace?: ItemTrace;
  source: string;
  available: Quantities;
}) {
  const perRun = step ? step.inputsPerRun : new Map([...entry.inputs].map(([item, total]) => [item, total / entry.runs]));
  const rows = [...entry.inputs].sort(([a], [b]) => compareNames(a, b));
  return (
    <>
      <table className="grid step-inputs" aria-label={`Materials for ${entry.product}`}>
        <thead>
          <tr>
            <th>Material</th>
            <th className="num">Per run</th>
            <th className="num">Total ({formatQuantity(entry.runs)} runs)</th>
            <th className="num">{step ? "Taken" : source === "the hangar" ? "In hangar now" : "In reserved pile now"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([item, total]) => (
            <tr key={item}>
              <td>
                <StockLink item={item} />
              </td>
              <td className="num">{formatQuantity(perRun.get(item) ?? 0)}</td>
              <td className="num">{formatQuantity(total)}</td>
              <td className="num">{formatQuantity((step ? step.deducted?.get(item) : available.get(item)) ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {step ? (
        <ul>
          <li>
            Started{step.started && ` ${formatTime(step.started)}`} with the recipe as it was then: {formatQuantity(step.runs)} ×{" "}
            {formatQuantity(step.outputPerRun)} = {formatQuantity(entry.output)}.
          </li>
          {step.deducted && <li>Taken from {step.takenFrom === "reserved" ? "the reserved pile" : "the hangar"}: {quantities(step.deducted)}.</li>}
          {step.short && <li className="failure">Short when started: {quantities(step.short)}.</li>}
        </ul>
      ) : (
        <Why trace={trace} source={source} />
      )}
    </>
  );
}

function quantities(q: Quantities): string {
  return [...q].map(([item, n]) => `${formatQuantity(n)} ${item}`).join(", ");
}

/** Asked for an intermediate with several recipes and no valid choice (material-calculation spec, "Choosing a variant"). */
function VariantPrompt({
  plan,
  at,
  product,
  variants,
  invalid,
  still,
}: {
  plan: Plan;
  at: PlanAt;
  product: string;
  variants: string[];
  invalid?: string;
  still: number;
}) {
  const choose = useChooseVariant(plan, at);
  return (
    <div className="panel-box variant-prompt" role="group" aria-label={`Recipe for ${product}`}>
      <p>
        {invalid !== undefined && <span className="failure">The recipe chosen for {product}, {invalid}, no longer exists. </span>}
        Which recipe should this plan use for {product}? {formatQuantity(still)} still to make; nothing below it is worked out until you
        choose.
      </p>
      <div className="actions">
        {variants.map((v) => (
          <button key={v} type="button" disabled={choose.pending} onClick={() => void choose.run(product, v)}>
            {v}
          </button>
        ))}
      </div>
      <Failure action={choose} />
    </div>
  );
}

/** The plan's recipe choices, visible and changeable at any time. */
function VariantChoices({ plan, at, options }: { plan: Plan; at: PlanAt; options: ReturnType<typeof variantOptions> }) {
  const choose = useChooseVariant(plan, at);
  return (
    <div className="variant-choices">
      <h2>Recipe choices</h2>
      <table className="grid">
        <tbody>
          {options.map((o) => (
            <tr key={o.product}>
              <td>{o.product}</td>
              <td>
                <select
                  aria-label={`Recipe for ${o.product}`}
                  value={o.chosenIsValid ? o.chosen : ""}
                  aria-invalid={o.chosen !== undefined && !o.chosenIsValid ? true : undefined}
                  disabled={choose.pending}
                  onChange={(e) => void choose.run(o.product, e.target.value)}
                >
                  {!o.chosenIsValid && <option value="">{o.chosen === undefined ? "(not chosen)" : `${o.chosen} (no longer exists)`}</option>}
                  {o.variants.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Failure action={choose} />
    </div>
  );
}

/** Setting a recipe choice; on a reserved plan, only after confirming that the reservation is released. */
function useChooseVariant(plan: Plan, at: PlanAt) {
  const confirm = useConfirm();
  const action = useAction<PlanRefusal>();
  const run = async (product: string, variant: string) => {
    if (plan.reserved) {
      const confirmed = await confirm({
        title: `Use ${variant} for ${product}?`,
        consequences: [
          `${plan.name} has reserved its materials. Changing a recipe choice changes what it needs, so its reservation is released: everything in its reserved pile returns to the hangar.`,
          "The plan can be reserved again once the hangar covers its new needs.",
        ],
        confirmLabel: "Change and release",
      });
      if (!confirmed) {
        return;
      }
    }
    await action.run((d) => setVariantChoice(d, at, product, variant));
  };
  return { ...action, run };
}

function DoneSteps({ done, steps }: { done: Array<{ step: PlanStep; index: number }>; steps?: StepActions }) {
  return (
    <table className="grid">
      <thead>
        <tr>
          <th>Item</th>
          <th>Recipe</th>
          <th className="num">Runs</th>
          <th className="num">Output</th>
          <th>Started</th>
          <th>Done</th>
          {steps && <th />}
        </tr>
      </thead>
      <tbody>
        {done.map(({ step, index }) => (
          <tr key={index}>
            <td>{step.product}</td>
            <td>{step.variant}</td>
            <td className="num">{formatQuantity(step.runs)}</td>
            <td className="num">{formatQuantity(step.runs * step.outputPerRun)}</td>
            <td>{step.started ? formatTime(step.started) : ""}</td>
            <td>{step.done && formatTime(step.done)}</td>
            {steps && (
              <td className="row-actions">
                <button
                  type="button"
                  className="link"
                  aria-label={`Undo done ${step.product}`}
                  disabled={steps.pending}
                  onClick={() => void steps.undo(index, step)}
                >
                  {step.started ? "Undo done" : "Undo"}
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Why the last step action did not happen, or did not save. */
function StepProblem({ steps }: { steps: StepActions }) {
  return (
    <>
      {steps.refusal && (
        <p className="failure" role="alert">
          {steps.refusal.kind === "entryChanged"
            ? `The step for ${steps.refusal.product} changed before it could be done - check the checklist and try again.`
            : steps.refusal.kind === "stepNotFound"
              ? `The step for ${steps.refusal.product} is no longer as shown.`
              : steps.refusal.kind === "planCompleted"
                ? "This plan is complete; its steps can no longer be changed."
                : "This plan no longer exists."}{" "}
          <button type="button" className="link" onClick={steps.dismiss}>
            Dismiss
          </button>
        </p>
      )}
      <Failure action={steps} />
    </>
  );
}
