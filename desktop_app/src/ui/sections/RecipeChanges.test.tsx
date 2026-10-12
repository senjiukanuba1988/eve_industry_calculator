import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../../app/oneAtATime";
import { DataStore } from "../../app/store";
import { emptyData } from "../../core/data/format";
import type { AppData, Plan, Recipe } from "../../core/data/model";
import type { DataFolder } from "../../storage/fileSystem";
import { MemoryFileSystem } from "../../storage/memoryFileSystem";
import { App } from "../App";

// One X from 3 y and 2 z, one y from 2 a and 2 b (recipe-library spec, "Changing a recipe that plans depend on").
const recipes: Recipe[] = [
  { product: "X", type: "T1 Manufacturing", output: 1, inputs: new Map([["y", 3], ["z", 2]]) },
  { product: "y", type: "T1 Manufacturing", output: 1, inputs: new Map([["a", 2], ["b", 2]]) },
  { product: "Reagent", type: "Reaction", output: 200, inputs: new Map([["a", 1]]) },
];

function plan(fields: Partial<Plan> = {}): Plan {
  return { name: "5 X", target: { product: "X" }, runs: 5, created: "2026-10-01T09:30:00+02:00", variantChoices: new Map(), steps: [], ...fields };
}

/** A reserved plan whose pile holds the base materials for its y, so the recipe for y matters to it. */
const reservedPlan = () => plan({ name: "Reserved X", reserved: new Map([["a", 30], ["b", 30], ["z", 10]]) });

function renderApp(plans: Plan[]) {
  const data: AppData = {
    ...emptyData("1.0.0"),
    items: { categories: new Map(), uncategorised: ["a", "b", "c", "Reagent", "X", "y", "z"] },
    recipes,
    hangar: { stock: new Map([["z", 4]]) },
    plans,
  };
  const folder: DataFolder = { fs: MemoryFileSystem.withFiles({}), path: "C:\\data", open: vi.fn() };
  const store = new DataStore(folder.fs, data, { appVersion: "1.0.0", queue: createQueue() });
  render(<App folder={folder} store={store} />);
  return { store };
}

const recipesPanel = () => within(screen.getByRole("region", { name: "Recipes" }));

async function editRecipe(product: string) {
  await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Recipes/ }));
  await userEvent.click(recipesPanel().getByRole("button", { name: product }));
}

async function setOutput(value: string) {
  const output = recipesPanel().getByRole("textbox", { name: "Output per run" });
  await userEvent.clear(output);
  await userEvent.type(output, value);
  await userEvent.click(recipesPanel().getByRole("button", { name: "Save" }));
}

const recipe = (store: DataStore, product: string) => store.current.recipes.find((r) => r.product === product)!;

describe("editing a recipe an open plan uses", () => {
  it("names the affected plans and saves on confirmation", async () => {
    const { store } = renderApp([plan()]);
    await editRecipe("y");
    await setOutput("2");

    const dialog = screen.getByRole("alertdialog", { name: "Save the changes to y?" });
    expect(dialog).toHaveTextContent("Open plans using it change: their outstanding steps follow the new recipe, while steps already started or done stay as they are: 5 X.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save recipe" }));

    await vi.waitFor(() => expect(recipe(store, "y").output).toBe(2));
  });

  it("saves without asking when no plan's work changes", async () => {
    const { store } = renderApp([plan()]);
    await editRecipe("Reagent");
    await setOutput("100");

    await vi.waitFor(() => expect(recipe(store, "Reagent").output).toBe(100));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("editing a recipe a reserved plan uses", () => {
  it("states that the reservation is released, and releases it on confirmation", async () => {
    const { store } = renderApp([reservedPlan()]);
    await editRecipe("y");
    await setOutput("2");

    const dialog = screen.getByRole("alertdialog", { name: "Save the changes to y?" });
    expect(dialog).toHaveTextContent("Reserved X has reserved its materials and this changes what it needs, so its reservation is released");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save and release" }));

    await vi.waitFor(() => expect(store.current.plans[0]!.reserved).toBeUndefined());
    expect(recipe(store, "y").output).toBe(2);
    expect(store.current.hangar.stock).toEqual(new Map([["a", 30], ["b", 30], ["z", 14]]));
  });

  it("leaves both the recipe and the reservation unchanged when declined", async () => {
    const { store } = renderApp([reservedPlan()]);
    const before = store.current;
    await editRecipe("y");
    await setOutput("2");
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));

    expect(store.current).toBe(before);
    expect(recipesPanel().getByRole("form", { name: "Edit recipe y" })).toBeInTheDocument();
  });
});

describe("deleting a recipe an open plan merely uses", () => {
  it("states that those plans will have to acquire the item, and that reservations are released", async () => {
    const { store } = renderApp([plan(), reservedPlan()]);
    await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Recipes/ }));
    await userEvent.click(recipesPanel().getByRole("button", { name: "Delete y" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete the recipe for y?" });
    expect(dialog).toHaveTextContent("Open plans that build y along the way will have to acquire it instead: 5 X.");
    expect(dialog).toHaveTextContent("Reserved X has reserved its materials");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete and release" }));

    await vi.waitFor(() => expect(store.current.recipes.some((r) => r.product === "y")).toBe(false));
    expect(store.current.plans[1]!.reserved).toBeUndefined();
  });
});

describe("deleting a variant an open plan uses, while other variants remain", () => {
  it("states that those plans will have to choose another variant", async () => {
    const pack: Recipe = { product: "Pack", type: "T1 Manufacturing", output: 1, inputs: new Map([["Drone", 2]]) };
    const drone = (variant: string, input: string): Recipe => ({ product: "Drone", variant, type: "T2 Manufacturing", output: 1, inputs: new Map([[input, 1]]) });
    const data: AppData = {
      ...emptyData("1.0.0"),
      items: { categories: new Map(), uncategorised: ["a", "b", "Drone", "Pack"] },
      recipes: [pack, drone("Fast", "a"), drone("Cheap", "b")],
      plans: [plan({ name: "1 Pack", target: { product: "Pack" }, runs: 1, variantChoices: new Map([["Drone", "Cheap"]]) })],
    };
    const folder: DataFolder = { fs: MemoryFileSystem.withFiles({}), path: "C:\\data", open: vi.fn() };
    render(<App folder={folder} store={new DataStore(folder.fs, data, { appVersion: "1.0.0", queue: createQueue() })} />);

    await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Recipes/ }));
    await userEvent.click(recipesPanel().getByRole("button", { name: "Delete Drone (Cheap)" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete the recipe for Drone (Cheap)?" });
    expect(dialog).toHaveTextContent("Drone can still be made with Drone (Fast).");
    expect(dialog).toHaveTextContent("Open plans using this recipe for Drone will have to choose another: 1 Pack.");
  });
});
