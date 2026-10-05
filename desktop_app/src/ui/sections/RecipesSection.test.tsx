import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../../app/oneAtATime";
import { DataStore } from "../../app/store";
import { fixtureTexts } from "../../core/data/fixtures/fixture";
import { loadData } from "../../core/data/load";
import type { DataFolder } from "../../storage/fileSystem";
import { MemoryFileSystem } from "../../storage/memoryFileSystem";
import { App } from "../App";

function renderRecipes() {
  const loaded = loadData(fixtureTexts());
  if (!loaded.ok) {
    throw new Error("fixture does not load");
  }
  const folder: DataFolder = { fs: MemoryFileSystem.withFiles(fixtureTexts() as Record<string, string>), path: "C:\\data", open: vi.fn() };
  const store = new DataStore(folder.fs, loaded.data, { appVersion: "1.0.0", queue: createQueue() });
  render(<App folder={folder} store={store} />);
  return { store };
}

async function showRecipes() {
  await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Recipes/ }));
}

const products = () =>
  within(screen.getByRole("region", { name: "Recipes" }))
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0]!.textContent);

describe("RecipesSection", () => {
  it("lists recipes with product, variant, type, output and inputs", async () => {
    renderRecipes();
    await showRecipes();
    expect(screen.getByRole("columnheader", { name: "Output / run" })).toBeInTheDocument();
    expect(products()).toContain("Tungsten Carbide");
  });

  it("narrows by category, type and search", async () => {
    renderRecipes();
    await showRecipes();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by category" }), "Ships");
    expect(products()).toEqual(["Flycatcher"]);

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by category" }), "All categories");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by type" }), "Reaction");
    expect(products()).toContain("Tungsten Carbide");
    expect(products()).not.toContain("Flycatcher");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by type" }), "All types");
    await userEvent.type(screen.getByRole("searchbox", { name: "Search products" }), "acol");
    expect(new Set(products())).toEqual(new Set(["Acolyte II"]));

    await userEvent.type(screen.getByRole("searchbox", { name: "Search products" }), "zzz");
    expect(screen.getByText("No recipe matches.")).toBeInTheDocument();
  });

  it("deletes a recipe after a confirmation stating it becomes a base material", async () => {
    const { store } = renderRecipes();
    await showRecipes();
    await userEvent.click(screen.getByRole("button", { name: "Delete Tungsten Carbide" }));

    const dialog = screen.getByRole("alertdialog", { name: "Delete the recipe for Tungsten Carbide?" });
    expect(dialog).toHaveTextContent("Nothing makes Tungsten Carbide any more, so it becomes a base material");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete recipe" }));

    await vi.waitFor(() => expect(store.current.recipes.some((r) => r.product === "Tungsten Carbide")).toBe(false));
    expect(products()).not.toContain("Tungsten Carbide");
  });

  it("deletes nothing when the confirmation is cancelled", async () => {
    const { store } = renderRecipes();
    const before = store.current.recipes.length;
    await showRecipes();
    await userEvent.click(screen.getByRole("button", { name: "Delete Tungsten Carbide" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(store.current.recipes).toHaveLength(before);
  });

  it("refuses to delete a recipe an open plan builds, naming the plan, in the row", async () => {
    const { store } = renderRecipes();
    const target = store.current.plans.find((p) => p.completed === undefined)!.target;
    const name = target.variant ? `${target.product} (${target.variant})` : target.product;
    await showRecipes();
    await userEvent.click(screen.getByRole("button", { name: `Delete ${name}` }));
    await userEvent.click(screen.getByRole("button", { name: "Delete recipe" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Open plans build this recipe \(.+\)\. Complete or delete them first\./);
  });
});
