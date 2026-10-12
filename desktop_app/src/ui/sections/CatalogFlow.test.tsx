import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../../app/oneAtATime";
import { DataStore } from "../../app/store";
import { fixtureTexts } from "../../core/data/fixtures/fixture";
import { loadData } from "../../core/data/load";
import type { DataFolder } from "../../storage/fileSystem";
import { MemoryFileSystem } from "../../storage/memoryFileSystem";
import { App } from "../App";

// The item catalog as the rest of the application sees it (item-catalog spec, "Creating a
// category" and "Changing an item's category"; recipe-library spec, "Creating an item inline").

function renderApp() {
  const loaded = loadData(fixtureTexts());
  if (!loaded.ok) {
    throw new Error("fixture does not load");
  }
  const folder: DataFolder = { fs: MemoryFileSystem.withFiles(fixtureTexts() as Record<string, string>), path: "C:\\data", open: vi.fn() };
  const store = new DataStore(folder.fs, loaded.data, { appVersion: "1.0.0", queue: createQueue() });
  render(<App folder={folder} store={store} />);
  return { store };
}

const show = (name: string) =>
  userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: new RegExp(`^${name}`) }));
const panel = (name: string) => within(screen.getByRole("region", { name }));
const optionsOf = (select: HTMLElement) => within(select).getAllByRole("option").map((o) => o.textContent);

describe("a new category", () => {
  it("can be chosen straight away wherever categories are chosen", async () => {
    renderApp();
    await show("Items");
    await userEvent.type(panel("Items").getByRole("textbox", { name: "New category" }), "Salvage{Enter}");
    await panel("Items").findByRole("cell", { name: "Salvage" });

    expect(optionsOf(panel("Items").getByRole("combobox", { name: "Category of Tritanium" }))).toContain("Salvage");

    await show("Recipes");
    expect(optionsOf(panel("Recipes").getByRole("combobox", { name: "Filter by category" }))).toContain("Salvage");

    // And when creating an item inline in the recipe form.
    await userEvent.click(panel("Recipes").getByRole("button", { name: "New recipe" }));
    await userEvent.type(panel("Recipes").getByRole("combobox", { name: "Product" }), "Nocxium{Enter}");
    const create = screen.getByRole("group", { name: "Create item Nocxium" });
    expect(optionsOf(within(create).getByRole("combobox", { name: "Category for the new item" }))).toContain("Salvage");
  });
});

describe("changing an item's category", () => {
  it("is reflected at once in the recipe and hangar filters", async () => {
    renderApp();
    await show("Items");
    await userEvent.selectOptions(panel("Items").getByRole("combobox", { name: "Category of Flycatcher" }), "Structures");
    await userEvent.selectOptions(panel("Items").getByRole("combobox", { name: "Category of Construction Blocks" }), "Minerals");

    await show("Recipes");
    await userEvent.selectOptions(panel("Recipes").getByRole("combobox", { name: "Filter by category" }), "Structures");
    expect(panel("Recipes").getByRole("button", { name: "Flycatcher" })).toBeInTheDocument();
    await userEvent.selectOptions(panel("Recipes").getByRole("combobox", { name: "Filter by category" }), "Ships");
    expect(panel("Recipes").getByText("No recipe matches.")).toBeInTheDocument();

    await show("Hangar");
    await userEvent.selectOptions(panel("Hangar").getByRole("combobox", { name: "Filter stock by category" }), "Minerals");
    expect(panel("Hangar").getByRole("cell", { name: "Construction Blocks" })).toBeInTheDocument();
  });
});

describe("creating an item inline", () => {
  it("creates the item and binds the product to it without leaving the recipe form, which then saves", async () => {
    const { store } = renderApp();
    await show("Recipes");
    await userEvent.click(panel("Recipes").getByRole("button", { name: "New recipe" }));
    await userEvent.type(panel("Recipes").getByRole("combobox", { name: "Product" }), "Nocxium{Enter}");
    await userEvent.click(within(screen.getByRole("group", { name: "Create item Nocxium" })).getByRole("button", { name: "Create" }));

    await vi.waitFor(() => expect(store.current.items.uncategorised).toContain("Nocxium"));
    expect(panel("Recipes").getByRole("form", { name: "New recipe" })).toBeInTheDocument();
    expect(panel("Recipes").getByRole("combobox", { name: "Product" })).toHaveValue("Nocxium");

    await userEvent.type(panel("Recipes").getByRole("combobox", { name: "Input 1" }), "Pyerite");
    await userEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: /Pyerite/ }));
    await userEvent.type(panel("Recipes").getByRole("textbox", { name: "Quantity of Input 1" }), "3");
    await userEvent.click(panel("Recipes").getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(store.current.recipes.find((r) => r.product === "Nocxium")?.inputs).toEqual(new Map([["Pyerite", 3]])));
  });
});
