import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../../app/oneAtATime";
import { DataStore } from "../../app/store";
import { emptyData } from "../../core/data/format";
import type { AppData, Plan, PlanStep, Recipe } from "../../core/data/model";
import { setAvailable } from "../../core/hangar/stock";
import type { DataFolder } from "../../storage/fileSystem";
import { MemoryFileSystem } from "../../storage/memoryFileSystem";
import { App } from "../App";
import { ClockContext } from "../context";

const NOW = "2026-10-06T10:00:00+02:00";

// The X/y/z example from the production-plans spec: one X from 3 y and 2 z, one y from 2 a and 2 b.
const recipes: Recipe[] = [
  { product: "X", type: "T1 Manufacturing", output: 1, inputs: new Map([["y", 3], ["z", 2]]) },
  { product: "y", type: "T1 Manufacturing", output: 1, inputs: new Map([["a", 2], ["b", 2]]) },
  { product: "Reagent", type: "Reaction", output: 200, inputs: new Map([["a", 1]]) },
  { product: "Pack", type: "T1 Manufacturing", output: 1, inputs: new Map([["Drone", 2]]) },
  { product: "Drone", variant: "Fast", type: "T2 Manufacturing", output: 1, inputs: new Map([["a", 1]]) },
  { product: "Drone", variant: "Cheap", type: "T2 Manufacturing", output: 1, inputs: new Map([["b", 1]]) },
];

function plan(fields: Partial<Plan> = {}): Plan {
  return { name: "5 X", target: { product: "X" }, runs: 5, created: "2026-10-01T09:30:00+02:00", variantChoices: new Map(), steps: [], ...fields };
}

function data(plans: Plan[] = [], stock: Array<[string, number]> = [["y", 2], ["z", 12], ["a", 10], ["b", 50]]): AppData {
  return {
    ...emptyData("1.0.0"),
    items: { categories: new Map(), uncategorised: ["a", "b", "Drone", "Pack", "Reagent", "X", "y", "z"] },
    recipes,
    hangar: { stock: new Map(stock) },
    plans,
  };
}

function renderApp(initial: AppData) {
  const folder: DataFolder = { fs: MemoryFileSystem.withFiles({}), path: "C:\\data", open: vi.fn() };
  const store = new DataStore(folder.fs, initial, { appVersion: "1.0.0", queue: createQueue() });
  render(
    <ClockContext.Provider value={() => NOW}>
      <App folder={folder} store={store} />
    </ClockContext.Provider>,
  );
  return { store };
}

const plansPanel = () => within(screen.getByRole("region", { name: "Plans" }));

/** The checklist as "Step Item" per row, detail rows left out. */
const checklist = () =>
  within(screen.getByRole("columnheader", { name: "Step" }).closest("table")!)
    .getAllByRole("row")
    .slice(1)
    .filter((r) => !r.classList.contains("detail-row"))
    .map((r) => {
      const cells = within(r).getAllByRole("cell");
      return `${cells[0]!.textContent} ${cells[1]!.textContent}`;
    });

describe("creating plans", () => {
  it("creates a plan from a picked recipe with the suggested name, and opens it", async () => {
    const { store } = renderApp(data([plan()]));
    await userEvent.click(plansPanel().getByRole("button", { name: "New plan" }));
    await userEvent.type(plansPanel().getByRole("searchbox", { name: "Search recipes to build" }), "reag");
    await userEvent.click(plansPanel().getByRole("button", { name: "Reagent" }));

    const runs = plansPanel().getByRole("textbox", { name: "Runs" });
    await userEvent.clear(runs);
    await userEvent.type(runs, "5");
    expect(plansPanel().getByText("makes 1,000 Reagent")).toBeInTheDocument();
    expect(plansPanel().getByRole("textbox", { name: "Name" })).toHaveValue("1,000 Reagent");
    await userEvent.click(plansPanel().getByRole("button", { name: "Create plan" }));

    await vi.waitFor(() => expect(store.current.plans).toHaveLength(2));
    expect(store.current.plans[1]).toMatchObject({ name: "1,000 Reagent", target: { product: "Reagent" }, runs: 5, created: NOW });
    expect(plansPanel().getByRole("heading", { name: "1,000 Reagent" })).toBeInTheDocument();
  });

  it("starts from the recipe list when there is no open plan, and keeps a typed name when the runs change", async () => {
    const { store } = renderApp(data());
    await userEvent.click(plansPanel().getByRole("button", { name: "X" }));
    await userEvent.type(plansPanel().getByRole("textbox", { name: "Name" }), " for the corp");
    expect(plansPanel().getByRole("textbox", { name: "Name" })).toHaveValue("1 X for the corp");
    const runs = plansPanel().getByRole("textbox", { name: "Runs" });
    await userEvent.clear(runs);
    await userEvent.type(runs, "3");
    expect(plansPanel().getByRole("textbox", { name: "Name" })).toHaveValue("1 X for the corp");
    await userEvent.click(plansPanel().getByRole("button", { name: "Create plan" }));
    await vi.waitFor(() => expect(store.current.plans[0]).toMatchObject({ name: "1 X for the corp", runs: 3 }));
  });

  it("lets a variant be picked as the target, and refuses runs that are not whole", async () => {
    renderApp(data());
    await userEvent.click(plansPanel().getAllByRole("button", { name: "Drone" })[1]!);
    expect(plansPanel().getByText(/Drone \((Cheap|Fast)\)/)).toBeInTheDocument();
    const runs = plansPanel().getByRole("textbox", { name: "Runs" });
    await userEvent.clear(runs);
    await userEvent.type(runs, "1.5");
    expect(plansPanel().getByText("A whole number of at least 1.")).toBeInTheDocument();
    expect(plansPanel().getByRole("button", { name: "Create plan" })).toBeDisabled();
  });
});

describe("the plan list", () => {
  it("shows open plans by default and completed ones, with their removal date, separately", async () => {
    renderApp(data([plan(), plan({ name: "Old", completed: "2026-10-03T18:20:00+02:00" })]));
    expect(plansPanel().getByRole("cell", { name: "5 X" })).toBeInTheDocument();
    expect(plansPanel().queryByRole("cell", { name: "Old" })).not.toBeInTheDocument();

    await userEvent.click(plansPanel().getByRole("button", { name: "Completed (1)" }));
    expect(plansPanel().getByRole("cell", { name: "Old" })).toBeInTheDocument();
    expect(plansPanel().getByRole("cell", { name: "2026-10-10" })).toBeInTheDocument();
    expect(plansPanel().queryByRole("cell", { name: "5 X" })).not.toBeInTheDocument();
  });

  it("deletes a reserved plan after a confirmation naming it and its reserved materials", async () => {
    const { store } = renderApp(data([plan({ reserved: new Map([["z", 10]]) })]));
    await userEvent.click(plansPanel().getByRole("button", { name: "Delete 5 X" }));
    const dialog = screen.getByRole("alertdialog", { name: "Delete the plan 5 X?" });
    expect(dialog).toHaveTextContent("Its reserved materials return to the hangar: 10 z.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete plan" }));
    await vi.waitFor(() => expect(store.current.plans).toHaveLength(0));
    expect(store.current.hangar.stock.get("z")).toBe(22);
  });

  it("deletes nothing when the confirmation is cancelled, leaving the reservation and the hangar alone", async () => {
    const { store } = renderApp(data([plan({ reserved: new Map([["z", 10]]) })]));
    const before = store.current;
    await userEvent.click(plansPanel().getByRole("button", { name: "Delete 5 X" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.current).toBe(before);
  });

  it("deletes a completed plan on request", async () => {
    const { store } = renderApp(data([plan(), plan({ name: "Old", completed: "2026-10-03T18:20:00+02:00" })]));
    await userEvent.click(plansPanel().getByRole("button", { name: "Completed (1)" }));
    await userEvent.click(plansPanel().getByRole("button", { name: "Delete Old" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete plan" }));
    await vi.waitFor(() => expect(store.current.plans.map((p) => p.name)).toEqual(["5 X"]));
  });

  it("keeps a completed plan listed past its removal date while the application runs", async () => {
    // Completed a month before the clock's now; removal only happens when the application starts.
    renderApp(data([plan({ name: "Long done", completed: "2026-09-01T10:00:00+02:00" })]));
    await userEvent.click(plansPanel().getByRole("button", { name: "Completed (1)" }));
    expect(plansPanel().getByRole("cell", { name: "Long done" })).toBeInTheDocument();
  });
});

describe("the plan view", () => {
  const openPlan = async (name = "5 X") => userEvent.click(plansPanel().getByRole("button", { name }));

  it("lists Acquire entries first, then builds in dependency order with the target last", async () => {
    // 5 X need 15 y (2 held, 13 to make) and 10 z (held); 13 y need 26 a (10 held) and 26 b (held).
    renderApp(data([plan()]));
    await openPlan();
    expect(checklist()).toEqual(["Acquire a", "Build y", "Build target X"]);
    const acquire = within(screen.getAllByRole("row")[1]!).getAllByRole("cell");
    expect(acquire[4]).toHaveTextContent("16");
  });

  it("shows a step's materials and explains its quantity under Details", async () => {
    renderApp(data([plan()]));
    await openPlan();
    const details = plansPanel().getByRole("button", { name: "Details for y" });
    expect(details).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(details);
    expect(details).toHaveAttribute("aria-expanded", "true");

    const materials = screen.getByRole("table", { name: "Materials for y" });
    expect(within(materials).getByRole("columnheader", { name: "Total (13 runs)" })).toBeInTheDocument();
    expect(within(materials).getByRole("columnheader", { name: "In hangar now" })).toBeInTheDocument();
    const rows = within(materials)
      .getAllByRole("row")
      .slice(1)
      .map((r) => within(r).getAllByRole("cell").map((c) => c.textContent));
    expect(rows).toEqual([
      ["a", "2", "26", "10"],
      ["b", "2", "26", "50"],
    ]);

    const why = details.closest("tr")!.nextElementSibling!;
    expect(why).toHaveTextContent("Needed: 15 (15 for X).");
    expect(why).toHaveTextContent("2 from the hangar.");
    expect(why).toHaveTextContent("13 to make: 13 runs × 1 = 13.");

    await userEvent.click(details);
    expect(screen.queryByRole("table", { name: "Materials for y" })).not.toBeInTheDocument();
  });

  it("shows what a started step actually took", async () => {
    const started: PlanStep = {
      state: "started",
      product: "y",
      runs: 13,
      inputsPerRun: new Map([["a", 2], ["b", 2]]),
      outputPerRun: 1,
      takenFrom: "general",
      deducted: new Map([["a", 10], ["b", 26]]),
      short: new Map([["a", 16]]),
      started: "2026-10-05T21:50:00+02:00",
    };
    renderApp(data([plan({ steps: [started] })], [["y", 2], ["z", 12]]));
    await openPlan();
    await userEvent.click(plansPanel().getByRole("button", { name: "Details for y" }));
    const materials = screen.getByRole("table", { name: "Materials for y" });
    expect(within(materials).getByRole("columnheader", { name: "Taken" })).toBeInTheDocument();
    expect(within(materials).getAllByRole("row")[1]).toHaveTextContent(/^a22610$/);
  });

  it("lists fully covered base materials in a collapsed section, so they are seen to be accounted for", async () => {
    renderApp(data([plan()]));
    await openPlan();
    expect(checklist()).not.toContain("Acquire z");
    await userEvent.click(plansPanel().getByText("Covered materials (2)"));
    const rows = within(plansPanel().getByRole("table", { name: "Covered materials" })).getAllByRole("row").slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(["b26the hangar", "z10the hangar"]);
  });

  it("viewing a plan and its details changes nothing", async () => {
    const { store } = renderApp(data([plan()]));
    const before = store.current;
    await openPlan();
    await userEvent.click(plansPanel().getByRole("button", { name: "Details for y" }));
    await userEvent.click(plansPanel().getByText("Covered materials (2)"));
    await userEvent.click(plansPanel().getByRole("button", { name: /Plans/ }));
    expect(store.current).toBe(before);
  });

  it("shows a step done without starting with its done time and no start time", async () => {
    const done: PlanStep = {
      state: "done",
      product: "y",
      runs: 13,
      inputsPerRun: new Map([["a", 2], ["b", 2]]),
      outputPerRun: 1,
      takenFrom: "general",
      done: "2026-10-05T21:50:00+02:00",
      addedToReserved: 0,
      addedToGeneral: 13,
    };
    renderApp(data([plan({ steps: [done] })]));
    await openPlan();
    await userEvent.click(plansPanel().getByText("Completed steps (1)"));
    const row = within(plansPanel().getByRole("columnheader", { name: "Done" }).closest("table")!).getAllByRole("row")[1]!;
    expect(within(row).getAllByRole("cell").map((c) => c.textContent).slice(0, 6)).toEqual(["y", "", "13", "13", "", "2026-10-05 21:50"]);
  });

  it("drops an Acquire entry once the stock arrives, without a recalculate button", async () => {
    const { store } = renderApp(data([plan()]));
    await openPlan();
    expect(checklist()).toContain("Acquire a");
    await store.apply((d) => setAvailable(d, "a", 30));
    await vi.waitFor(() => expect(checklist()).toEqual(["Build y", "Build target X"]));
    expect(plansPanel().queryByRole("button", { name: /recalculate/i })).not.toBeInTheDocument();
  });

  it("shows a started step as started, with its time and shortfall", async () => {
    const started: PlanStep = {
      state: "started",
      product: "y",
      runs: 13,
      inputsPerRun: new Map([["a", 2], ["b", 2]]),
      outputPerRun: 1,
      takenFrom: "general",
      deducted: new Map([["a", 10], ["b", 26]]),
      short: new Map([["a", 16]]),
      started: "2026-10-05T21:50:00+02:00",
    };
    renderApp(data([plan({ steps: [started] })], [["y", 2], ["z", 12]]));
    await openPlan();
    expect(checklist()).toEqual(["Build y", "Build target X"]);
    expect(screen.getByText(/started 2026-10-05 21:50/)).toHaveTextContent("short 16 a");
  });

  it("keeps done steps in a collapsed section, with their times", async () => {
    const done: PlanStep = {
      state: "done",
      product: "y",
      runs: 13,
      inputsPerRun: new Map([["a", 2], ["b", 2]]),
      outputPerRun: 1,
      takenFrom: "general",
      deducted: new Map([["a", 26], ["b", 26]]),
      started: "2026-10-05T09:10:00+02:00",
      done: "2026-10-06T08:00:00+02:00",
      addedToReserved: 0,
      addedToGeneral: 13,
    };
    renderApp(data([plan({ steps: [done] })], [["y", 15], ["z", 12]]));
    await openPlan();
    expect(checklist()).toEqual(["Build target X"]);
    const section = screen.getByText("Completed steps (1)").closest("details")!;
    expect(section).not.toHaveAttribute("open");
    expect(section).toHaveTextContent("2026-10-05 09:10");
    expect(section).toHaveTextContent("2026-10-06 08:00");
  });

  it("asks which variant to use, remembers the answer, and keeps it changeable", async () => {
    const { store } = renderApp(data([plan({ name: "Packs", target: { product: "Pack" }, runs: 2 })], []));
    await openPlan("Packs");
    const prompt = plansPanel().getByRole("group", { name: "Recipe for Drone" });
    expect(prompt).toHaveTextContent("Which recipe should this plan use for Drone? 4 still to make");
    expect(checklist()).toEqual(["Build target Pack"]);

    await userEvent.click(within(prompt).getByRole("button", { name: "Cheap" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.variantChoices.get("Drone")).toBe("Cheap"));
    expect(plansPanel().queryByRole("group", { name: "Recipe for Drone" })).not.toBeInTheDocument();
    expect(checklist()).toEqual(["Acquire b", "Build Drone", "Build target Pack"]);

    await userEvent.selectOptions(plansPanel().getByRole("combobox", { name: "Recipe for Drone" }), "Fast");
    await vi.waitFor(() => expect(checklist()).toEqual(["Acquire a", "Build Drone", "Build target Pack"]));
  });

  it("flags a remembered choice that no longer exists", async () => {
    renderApp(data([plan({ name: "Packs", target: { product: "Pack" }, runs: 2, variantChoices: new Map([["Drone", "Gone"]]) })], []));
    await openPlan("Packs");
    expect(plansPanel().getByRole("group", { name: "Recipe for Drone" })).toHaveTextContent("The recipe chosen for Drone, Gone, no longer exists.");
    expect(plansPanel().getByRole("combobox", { name: "Recipe for Drone" })).toHaveAttribute("aria-invalid", "true");
  });

  it("warns before changing a variant on a reserved plan, and changes nothing if cancelled", async () => {
    const reserved = plan({ name: "Packs", target: { product: "Pack" }, runs: 2, variantChoices: new Map([["Drone", "Cheap"]]), reserved: new Map([["b", 4]]) });
    const { store } = renderApp(data([reserved], []));
    await openPlan("Packs");
    await userEvent.selectOptions(plansPanel().getByRole("combobox", { name: "Recipe for Drone" }), "Fast");
    const dialog = screen.getByRole("alertdialog", { name: "Use Fast for Drone?" });
    expect(dialog).toHaveTextContent("its reservation is released");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(store.current.plans[0]!.reserved).toEqual(new Map([["b", 4]]));
    expect(store.current.plans[0]!.variantChoices.get("Drone")).toBe("Cheap");
  });

  it("renames a plan in place and stays on it", async () => {
    const { store } = renderApp(data([plan()]));
    await openPlan();
    await userEvent.click(plansPanel().getByRole("button", { name: "Rename" }));
    const input = plansPanel().getByRole("textbox", { name: "Plan name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Corp order{Enter}");
    await vi.waitFor(() => expect(store.current.plans[0]!.name).toBe("Corp order"));
    expect(plansPanel().getByRole("heading", { name: "Corp order" })).toBeInTheDocument();
    expect(checklist()).toContain("Build target X");
  });

  it("shows the creation time, and for a completed plan its completion and removal date", async () => {
    renderApp(data([plan({ name: "Old", completed: "2026-10-03T18:20:00+02:00" })]));
    await userEvent.click(plansPanel().getByRole("button", { name: "Completed (1)" }));
    await openPlan("Old");
    expect(plansPanel().getByText("Created 2026-10-01 09:30")).toBeInTheDocument();
    expect(plansPanel().getByText("Completed 2026-10-03 18:20, removed on 2026-10-10")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Step" })).not.toBeInTheDocument();
  });

  it("is still shown after switching to another section and back", async () => {
    renderApp(data([plan()]));
    await openPlan();
    const nav = within(screen.getByRole("navigation", { name: "Sections" }));
    await userEvent.click(nav.getByRole("button", { name: /Recipes/ }));
    await userEvent.click(nav.getByRole("button", { name: /Plans/ }));
    expect(plansPanel().getByRole("heading", { name: "5 X" })).toBeInTheDocument();
  });
});

describe("working the steps", () => {
  const openPlan = async () => userEvent.click(plansPanel().getByRole("button", { name: "5 X" }));
  const rowOf = (item: string) =>
    within(screen.getByRole("columnheader", { name: "Step" }).closest("table")!)
      .getAllByRole("row")
      .find((r) => within(r).queryAllByRole("cell")[1]?.textContent === item)!;

  it("starts a step, taking its inputs, and shows it started", async () => {
    // 13 y take 26 a and 26 b; the hangar holds 30 a and 50 b.
    const { store } = renderApp(data([plan()], [["y", 2], ["z", 12], ["a", 30], ["b", 50]]));
    await openPlan();
    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Start" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.steps).toHaveLength(1));
    expect(store.current.hangar.stock.get("a")).toBe(4);
    expect(store.current.plans[0]!.steps[0]).toMatchObject({ state: "started", started: NOW });
    expect(within(rowOf("y")).getByText(/started 2026-10-06 10:00/)).toBeInTheDocument();
  });

  it("warns before starting short, listing what is missing; declining changes nothing", async () => {
    const { store } = renderApp(data([plan()]));
    await openPlan();
    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Start" }));
    const dialog = screen.getByRole("alertdialog", { name: "Start 13 runs of y with too little?" });
    expect(dialog).toHaveTextContent("Short: 16 a.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(store.current.plans[0]!.steps).toEqual([]);
    expect(store.current.hangar.stock.get("a")).toBe(10);

    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Start" }));
    await userEvent.click(screen.getByRole("button", { name: "Start anyway" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.steps[0]!.short).toEqual(new Map([["a", 16]])));
    expect(store.current.hangar.stock.has("a")).toBe(false);
    expect(within(rowOf("y")).getByText(/short 16 a/)).toBeInTheDocument();
  });

  it("marking a not-started step done asks whether to deduct its inputs", async () => {
    const { store } = renderApp(data([plan()], [["y", 2], ["z", 12], ["a", 30], ["b", 50]]));
    await openPlan();
    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Done" }));
    const dialog = screen.getByRole("alertdialog", { name: "Mark y done without starting it?" });
    expect(dialog).toHaveTextContent("Its inputs have not been taken from the hangar yet: 26 a, 26 b.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add output only" }));
    await vi.waitFor(() => expect(store.current.hangar.stock.get("y")).toBe(15));
    expect(store.current.hangar.stock.get("a")).toBe(30);
    expect(screen.getByText("Completed steps (1)")).toBeInTheDocument();
  });

  it("marking a not-started step done can deduct its inputs as well", async () => {
    const { store } = renderApp(data([plan()], [["y", 2], ["z", 12], ["a", 30], ["b", 50]]));
    await openPlan();
    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Done" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Deduct inputs and add output" }));
    await vi.waitFor(() => expect(store.current.hangar.stock.get("y")).toBe(15));
    expect(store.current.hangar.stock.get("a")).toBe(4);
    expect(store.current.hangar.stock.get("b")).toBe(24);
  });

  it("completes a started step and undoes it again, all the way back", async () => {
    const { store } = renderApp(data([plan()], [["y", 2], ["z", 12], ["a", 30], ["b", 50]]));
    await openPlan();
    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Start" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.steps).toHaveLength(1));
    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Done" }));
    await vi.waitFor(() => expect(store.current.hangar.stock.get("y")).toBe(15));

    await userEvent.click(screen.getByText("Completed steps (1)"));
    await userEvent.click(screen.getByRole("button", { name: "Undo done y" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.steps[0]!.state).toBe("started"));
    expect(store.current.hangar.stock.get("y")).toBe(2);

    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Undo start" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.steps).toEqual([]));
    expect(store.current.hangar.stock.get("a")).toBe(30);
  });

  it("warns when undoing a done step whose output has been used since", async () => {
    const { store } = renderApp(data([plan()], [["y", 2], ["z", 12], ["a", 30], ["b", 50]]));
    await openPlan();
    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Start" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.steps).toHaveLength(1));
    await userEvent.click(within(rowOf("y")).getByRole("button", { name: "Done" }));
    await vi.waitFor(() => expect(store.current.hangar.stock.get("y")).toBe(15));
    await store.apply((d) => setAvailable(d, "y", 5));

    await userEvent.click(screen.getByText("Completed steps (1)"));
    await userEvent.click(screen.getByRole("button", { name: "Undo done y" }));
    expect(screen.getByRole("alertdialog", { name: "Undo y done?" })).toHaveTextContent("8 of the 13 y it added have been used since");
    await userEvent.click(screen.getByRole("button", { name: "Undo anyway" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.steps[0]!.notRemoved).toBe(8));
    expect(within(rowOf("y")).getByText(/8 of its output could not be removed/)).toBeInTheDocument();
  });

  it("marking the target done completes the plan", async () => {
    const { store } = renderApp(data([plan()], [["y", 15], ["z", 10]]));
    await openPlan();
    await userEvent.click(within(rowOf("X")).getByRole("button", { name: "Start" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.steps).toHaveLength(1));
    await userEvent.click(within(rowOf("X")).getByRole("button", { name: "Done" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.completed).toBe(NOW));
    expect(store.current.hangar.stock.get("X")).toBe(5);
    expect(plansPanel().getByText(/Completed 2026-10-06 10:00, removed on 2026-10-13/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo done X" })).not.toBeInTheDocument();
  });
});

describe("reserving from the plan view", () => {
  const openPlan = async () => userEvent.click(plansPanel().getByRole("button", { name: "5 X" }));

  it("lists what is missing when the plan is not covered, and reserves once it is", async () => {
    const { store } = renderApp(data([plan()]));
    await openPlan();
    await userEvent.click(plansPanel().getByRole("button", { name: "Reserve materials" }));
    expect(await plansPanel().findByRole("alert")).toHaveTextContent("Cannot reserve yet - still to acquire: 16 a.");
    expect(store.current.plans[0]!.reserved).toBeUndefined();

    await store.apply((d) => setAvailable(d, "a", 30));
    await userEvent.click(plansPanel().getByRole("button", { name: "Reserve materials" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.reserved).toEqual(new Map([["y", 2], ["z", 10], ["a", 26], ["b", 26]])));
    expect(plansPanel().getByText("Reserved materials (4)")).toBeInTheDocument();
    await userEvent.click(plansPanel().getByRole("button", { name: "Details for y" }));
    expect(within(screen.getByRole("table", { name: "Materials for y" })).getByRole("columnheader", { name: "In reserved pile now" })).toBeInTheDocument();

    await userEvent.click(plansPanel().getByRole("button", { name: "Release" }));
    await vi.waitFor(() => expect(store.current.plans[0]!.reserved).toBeUndefined());
    expect(store.current.hangar.stock.get("a")).toBe(30);
  });
});
