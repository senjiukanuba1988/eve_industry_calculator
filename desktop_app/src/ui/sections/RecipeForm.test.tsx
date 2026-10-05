import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../../app/oneAtATime";
import { DataStore } from "../../app/store";
import { emptyData } from "../../core/data/format";
import type { AppData, Recipe } from "../../core/data/model";
import type { DataFolder } from "../../storage/fileSystem";
import { MemoryFileSystem } from "../../storage/memoryFileSystem";
import { App } from "../App";

const ITEMS = ["Acolyte II", "Acolyte I", "Robotics", "Morphite", "Tritanium", "Pyerite", "Tungsten Carbide", "Sulfuric Acid"];

function renderApp(recipes: Recipe[] = []) {
  const data: AppData = { ...emptyData("1.0.0"), items: { categories: new Map([["Minerals", []]]), uncategorised: ITEMS }, recipes };
  const folder: DataFolder = { fs: MemoryFileSystem.withFiles({}), path: "C:\\data", open: vi.fn(async () => undefined) };
  const store = new DataStore(folder.fs, data, { appVersion: "1.0.0", queue: createQueue() });
  render(<App folder={folder} store={store} />);
  return { store };
}

async function openNewRecipe() {
  await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Recipes/ }));
  await userEvent.click(screen.getByRole("button", { name: "New recipe" }));
  return screen.getByRole("form", { name: "New recipe" });
}

/** Types into an item field and chooses the exact match from the suggestions (the test items have no category). */
async function chooseItem(label: string, name: string) {
  const field = screen.getByRole("combobox", { name: label });
  await userEvent.clear(field);
  await userEvent.type(field, name);
  await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name }));
}

async function addInput(n: number, name: string, quantity: string) {
  await chooseItem(`Input ${n}`, name);
  await userEvent.type(screen.getByRole("textbox", { name: `Quantity of Input ${n}` }), quantity);
}

const save = () => userEvent.click(screen.getByRole("button", { name: "Save" }));

describe("RecipeForm", () => {
  it("is reached from the Plans start page when there is nothing yet", async () => {
    renderApp();
    await userEvent.click(screen.getByRole("button", { name: "Create the first recipe" }));
    expect(screen.getByRole("form", { name: "New recipe" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Product" })).toHaveFocus();
  });

  it("saves a recipe entered end to end, and returns to the list", async () => {
    const { store } = renderApp();
    await openNewRecipe();
    await chooseItem("Product", "Tungsten Carbide");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Type" }), "Reaction");
    await userEvent.clear(screen.getByRole("textbox", { name: "Output per run" }));
    await userEvent.type(screen.getByRole("textbox", { name: "Output per run" }), "10,000");
    await addInput(1, "Sulfuric Acid", "98");
    await addInput(2, "Tritanium", "1");
    await save();

    await vi.waitFor(() => expect(store.current.recipes).toHaveLength(1));
    expect(store.current.recipes[0]).toMatchObject({
      product: "Tungsten Carbide",
      type: "Reaction",
      output: 10000,
      inputs: new Map([
        ["Sulfuric Acid", 98],
        ["Tritanium", 1],
      ]),
    });
    expect(screen.getByRole("heading", { name: "Recipes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tungsten Carbide" })).toBeInTheDocument();
  });

  it("always offers an empty row for the next input", async () => {
    renderApp();
    await openNewRecipe();
    expect(screen.getAllByRole("combobox", { name: /^Input/ })).toHaveLength(1);
    await addInput(1, "Tritanium", "5");
    expect(screen.getAllByRole("combobox", { name: /^Input/ })).toHaveLength(2);
  });

  it("does not allow saving while a name is not bound to an item, marking the row", async () => {
    renderApp();
    await openNewRecipe();
    await chooseItem("Product", "Acolyte I");
    await userEvent.type(screen.getByRole("combobox", { name: "Input 1" }), "Tritanum");
    await userEvent.type(screen.getByRole("textbox", { name: "Quantity of Input 1" }), "10");

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "Input 1" })).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Not an item yet: choose a suggestion, or create it.")).toBeInTheDocument();

    await chooseItem("Input 1", "Tritanium");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows a rule broken at the field at fault, keeping everything typed", async () => {
    renderApp();
    await openNewRecipe();
    await chooseItem("Product", "Acolyte I");
    await addInput(1, "Tritanium", "0");
    await save();

    const row = screen.getByRole("combobox", { name: "Input 1" }).closest("tr")!;
    expect(await within(row).findByRole("alert")).toHaveTextContent("The quantity must be a whole number of at least 1.");
    expect(screen.getByRole("textbox", { name: "Quantity of Input 1" })).toHaveValue("0");
    expect(screen.getByRole("combobox", { name: "Product" })).toHaveValue("Acolyte I");
  });

  it("offers to combine the same input entered twice", async () => {
    const { store } = renderApp();
    await openNewRecipe();
    await chooseItem("Product", "Acolyte I");
    await addInput(1, "Tritanium", "2");
    await addInput(2, "Morphite", "1");
    await addInput(3, "Tritanium", "3");
    await save();

    expect(await screen.findAllByText('"Tritanium" is listed more than once.')).toHaveLength(2);
    await userEvent.click(screen.getAllByRole("button", { name: "Combine into one row (5)" })[0]!);
    expect(screen.getByRole("combobox", { name: "Input 1" })).toHaveValue("Tritanium");
    expect(screen.getByRole("textbox", { name: "Quantity of Input 1" })).toHaveValue("5");
    expect(screen.getByRole("combobox", { name: "Input 2" })).toHaveValue("Morphite");
    expect(screen.getByRole("combobox", { name: "Input 3" })).toHaveValue("");

    await save();
    await vi.waitFor(() => expect(store.current.recipes[0]?.inputs.get("Tritanium")).toBe(5));
  });

  it("shows the circle a recipe would close", async () => {
    renderApp([{ product: "Robotics", type: "T1 Manufacturing", output: 1, inputs: new Map([["Acolyte I", 1]]) }]);
    await openNewRecipe();
    await chooseItem("Product", "Acolyte I");
    await addInput(1, "Robotics", "1");
    await save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Robotics → Acolyte I → Robotics");
  });

  it("asks in place for a label for the existing recipe when adding a second T2 variant, then saves both", async () => {
    const { store } = renderApp([{ product: "Acolyte II", type: "T2 Manufacturing", output: 1, inputs: new Map([["Acolyte I", 1]]) }]);
    await openNewRecipe();
    await chooseItem("Product", "Acolyte II");
    expect(screen.getByRole("combobox", { name: "Type" })).toHaveValue("T2 Manufacturing");
    await userEvent.type(screen.getByRole("textbox", { name: "Variant label" }), "Symmetry Decryptor");
    await addInput(1, "Robotics", "1");
    await save();

    const existing = await screen.findByRole("textbox", { name: "Label for the existing recipe" });
    expect(existing).toHaveFocus();
    expect(store.current.recipes).toHaveLength(1);

    await userEvent.type(existing, "Accelerant Decryptor");
    await save();
    await vi.waitFor(() =>
      expect(store.current.recipes.map((r) => r.variant).sort()).toEqual(["Accelerant Decryptor", "Symmetry Decryptor"]),
    );
  });

  it("rejects a second recipe for a non-T2 product at the product field", async () => {
    renderApp([{ product: "Robotics", type: "Planetary Industry", output: 1, inputs: new Map([["Tritanium", 1]]) }]);
    await openNewRecipe();
    await chooseItem("Product", "Robotics");
    await addInput(1, "Pyerite", "1");
    await save();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "There is already a recipe for Robotics: Robotics. Only T2 Manufacturing products may have more than one.",
    );
  });

  it("opens a recipe from the list for editing, and saves the change in place", async () => {
    const { store } = renderApp([{ product: "Robotics", type: "T1 Manufacturing", output: 1, inputs: new Map([["Tritanium", 4]]) }]);
    await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Recipes/ }));
    await userEvent.click(screen.getByRole("button", { name: "Robotics" }));

    expect(screen.getByRole("form", { name: "Edit recipe Robotics" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Input 1" })).toHaveValue("Tritanium");
    await userEvent.click(screen.getByRole("button", { name: "Remove Input 1" }));
    await addInput(1, "Morphite", "2");
    await save();

    await vi.waitFor(() => expect(store.current.recipes[0]!.inputs).toEqual(new Map([["Morphite", 2]])));
    expect(store.current.recipes).toHaveLength(1);
  });

  it("'Save and enter another' starts a fresh form", async () => {
    const { store } = renderApp();
    await openNewRecipe();
    await chooseItem("Product", "Acolyte I");
    await addInput(1, "Tritanium", "1");
    await userEvent.click(screen.getByRole("button", { name: "Save and enter another" }));
    await vi.waitFor(() => expect(store.current.recipes).toHaveLength(1));
    expect(screen.getByRole("combobox", { name: "Product" })).toHaveValue("");
    expect(screen.getByRole("combobox", { name: "Product" })).toHaveFocus();
  });

  it("keeps an unfinished form while another section is visited", async () => {
    renderApp();
    await openNewRecipe();
    await chooseItem("Product", "Acolyte I");
    await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Items/ }));
    await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Recipes/ }));
    expect(screen.getByRole("combobox", { name: "Product" })).toHaveValue("Acolyte I");
  });
});
