import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../../app/oneAtATime";
import { DataStore } from "../../app/store";
import { emptyData } from "../../core/data/format";
import type { AppData, Plan, Recipe } from "../../core/data/model";
import type { DataFolder } from "../../storage/fileSystem";
import { MemoryFileSystem } from "../../storage/memoryFileSystem";
import { App } from "../App";

// Jumping between related things (application-shell spec) and creating a missing recipe
// from a plan (item-catalog spec, "Missing recipes are visible, not silent").

// One X from 3 y and 2 z, one y from 2 a and 2 b.
const recipes: Recipe[] = [
  { product: "X", type: "T1 Manufacturing", output: 1, inputs: new Map([["y", 3], ["z", 2]]) },
  { product: "y", type: "T1 Manufacturing", output: 1, inputs: new Map([["a", 2], ["b", 2]]) },
  { product: "Reagent", type: "Reaction", output: 200, inputs: new Map([["a", 1]]) },
];

function plan(fields: Partial<Plan> = {}): Plan {
  return { name: "5 X", target: { product: "X" }, runs: 5, created: "2026-10-01T09:30:00+02:00", variantChoices: new Map(), steps: [], ...fields };
}

function renderApp(plans: Plan[] = [plan()]) {
  const data: AppData = {
    ...emptyData("1.0.0"),
    items: { categories: new Map(), uncategorised: ["a", "b", "c", "Reagent", "X", "y", "z", "zz"] },
    recipes,
    hangar: { stock: new Map([["z", 4], ["zz", 1]]) },
    plans,
  };
  const folder: DataFolder = { fs: MemoryFileSystem.withFiles({}), path: "C:\\data", open: vi.fn() };
  const store = new DataStore(folder.fs, data, { appVersion: "1.0.0", queue: createQueue() });
  render(<App folder={folder} store={store} />);
  return { store };
}

const section = (name: string) => async () =>
  userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: new RegExp(`^${name}`) }));
const showRecipes = section("Recipes");
const panel = (name: string) => within(screen.getByRole("region", { name }));

async function openPlan(name = "5 X") {
  await userEvent.click(panel("Plans").getByRole("button", { name }));
}

describe("from a recipe to a new plan", () => {
  it("starts a plan from the recipe list, with that recipe already chosen", async () => {
    renderApp();
    await showRecipes();
    await userEvent.click(panel("Recipes").getByRole("button", { name: "New plan for Reagent" }));

    expect(panel("Plans").getByRole("textbox", { name: "Runs" })).toBeInTheDocument();
    expect(panel("Plans").getByRole("textbox", { name: "Name" })).toHaveValue("200 Reagent");
  });

  it("starts a plan from a recipe being viewed", async () => {
    renderApp();
    await showRecipes();
    await userEvent.click(panel("Recipes").getByRole("button", { name: "y" }));
    await userEvent.click(panel("Recipes").getByRole("button", { name: "New plan from this recipe" }));

    expect(panel("Plans").getByRole("textbox", { name: "Name" })).toHaveValue("1 y");
  });
});

describe("from a plan step to its recipe", () => {
  it("opens the recipe behind a build step, and goes back to the plan when done", async () => {
    renderApp();
    await openPlan();
    await userEvent.click(panel("Plans").getByRole("button", { name: "Open recipe y" }));

    expect(panel("Recipes").getByRole("form", { name: "Edit recipe y" })).toBeInTheDocument();
    await userEvent.click(panel("Recipes").getByRole("button", { name: "Cancel" }));

    expect(panel("Plans").getByRole("heading", { name: "5 X" })).toBeInTheDocument();
  });

  it("shows a started step's recipe as plain text once that recipe is gone", async () => {
    const started = { state: "started" as const, product: "Gone", runs: 1, inputsPerRun: new Map([["a", 1]]), outputPerRun: 1, takenFrom: "general" as const, variant: "Old" };
    renderApp([plan({ steps: [started] })]);
    await openPlan();

    expect(panel("Plans").queryByRole("button", { name: "Open recipe Gone (Old)" })).not.toBeInTheDocument();
    expect(panel("Plans").getByText("Old")).toBeInTheDocument();
  });
});

describe("from a material to its stock", () => {
  it("shows the item's hangar position, with the plans holding it reserved", async () => {
    renderApp([plan(), plan({ name: "Other", reserved: new Map([["z", 6]]) })]);
    await openPlan();
    await userEvent.click(panel("Plans").getByRole("button", { name: "Details for y" }));
    await userEvent.click(within(panel("Plans").getByRole("table", { name: "Materials for y" })).getByRole("button", { name: "Hangar stock of a" }));
    expect(panel("Hangar").getByText("No a in the hangar, available or reserved.")).toBeInTheDocument();

    await section("Plans")();
    await userEvent.click(panel("Plans").getByRole("button", { name: "Hangar stock of z" }));

    const rows = panel("Hangar").getAllByRole("row");
    // Only z, not zz, which the search text would also match; the reserved part is opened.
    expect(within(rows[1]!).getAllByRole("cell").map((c) => c.textContent)).toEqual(["z", "", "4", "6", "10", expect.any(String)]);
    expect(panel("Hangar").getByText("Other")).toBeInTheDocument();
    expect(panel("Hangar").queryByText("zz")).not.toBeInTheDocument();

    // Typing in the search shows the hangar as usual again.
    await userEvent.type(panel("Hangar").getByRole("searchbox", { name: "Search stock" }), "z");
    expect(panel("Hangar").getByText("zz")).toBeInTheDocument();
  });
});

describe("creating a recipe for a base material", () => {
  it("opens a new recipe for it, and the plan expands it once saved", async () => {
    const { store } = renderApp();
    await openPlan();
    await userEvent.click(panel("Plans").getByRole("button", { name: "Create a recipe for a" }));

    const form = panel("Recipes").getByRole("form", { name: "New recipe" });
    expect(within(form).getByRole("combobox", { name: "Product" })).toHaveValue("a");
    await userEvent.type(within(form).getByRole("combobox", { name: "Input 1" }), "c");
    await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "c" }));
    await userEvent.type(within(form).getByRole("textbox", { name: "Quantity of Input 1" }), "1");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(store.current.recipes.some((r) => r.product === "a")).toBe(true));
    // Back on the plan: a is built now, and c is what is left to acquire.
    expect(panel("Plans").getByRole("button", { name: "Open recipe a" })).toBeInTheDocument();
    expect(panel("Plans").getByRole("button", { name: "Create a recipe for c" })).toBeInTheDocument();
    expect(panel("Plans").queryByRole("button", { name: "Create a recipe for a" })).not.toBeInTheDocument();
  });
});
