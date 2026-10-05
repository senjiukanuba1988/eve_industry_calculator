import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../../app/oneAtATime";
import { DataStore } from "../../app/store";
import { fixtureTexts } from "../../core/data/fixtures/fixture";
import { loadData } from "../../core/data/load";
import { MemoryFileSystem } from "../../storage/memoryFileSystem";
import { StoreContext } from "../context";
import { ItemsSection } from "./ItemsSection";

function renderItems() {
  const loaded = loadData(fixtureTexts());
  if (!loaded.ok) {
    throw new Error("fixture does not load");
  }
  const fs = MemoryFileSystem.withFiles(fixtureTexts() as Record<string, string>);
  const store = new DataStore(fs, loaded.data, { appVersion: "1.0.0", queue: createQueue() });
  render(
    <StoreContext.Provider value={store}>
      <ItemsSection />
    </StoreContext.Provider>,
  );
  return { fs, store };
}

const itemsTable = () => screen.getByRole("columnheader", { name: "Item" }).closest("table")!;
const itemNames = () =>
  within(itemsTable())
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0]!.textContent);

describe("ItemsSection", () => {
  it("lists every item with its category, sorted by name", () => {
    renderItems();
    expect(itemNames()).toEqual([
      "'Arbalest' Cruise Launcher I",
      "Acolyte I",
      "Acolyte II",
      "Construction Blocks",
      "Consumer Electronics",
      "Flycatcher",
      "Morphite",
      "Pyerite",
      "Reactive Metals",
      "Robotics",
      "Rolled Tungsten Alloy",
      "Sulfuric Acid",
      "Tritanium",
      "Tungsten Carbide",
    ]);
    expect(screen.getByRole("combobox", { name: "Category of Tritanium" })).toHaveValue("Minerals");
  });

  it("narrows by category, by no category, and by part of the name", async () => {
    renderItems();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by category" }), "Minerals");
    expect(itemNames()).toEqual(["Morphite", "Pyerite", "Tritanium"]);

    await userEvent.type(screen.getByRole("searchbox", { name: "Search items" }), "tri");
    expect(itemNames()).toEqual(["Tritanium"]);

    await userEvent.clear(screen.getByRole("searchbox", { name: "Search items" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter by category" }), "(no category)");
    expect(itemNames()).toEqual(["'Arbalest' Cruise Launcher I", "Acolyte I", "Acolyte II"]);
  });

  it("renames in place, and the new name reaches every file", async () => {
    const { fs } = renderItems();
    await userEvent.click(screen.getByRole("button", { name: "Rename Robotics" }));
    const input = screen.getByRole("textbox", { name: "New name for Robotics" });
    await userEvent.clear(input);
    await userEvent.type(input, "Robotics Mk2{Enter}");

    expect(await screen.findByRole("cell", { name: "Robotics Mk2" })).toBeInTheDocument();
    const files = fs.snapshot();
    for (const file of ["items.json", "recipes.json", "plans.json"]) {
      expect(files[file], file).toContain('"Robotics Mk2"');
      expect(files[file], file).not.toContain('"Robotics"');
    }
  });

  it("rejects a rename to a name in use, naming the item, and keeps the edit open", async () => {
    renderItems();
    await userEvent.click(screen.getByRole("button", { name: "Rename Robotics" }));
    const input = screen.getByRole("textbox", { name: "New name for Robotics" });
    await userEvent.clear(input);
    await userEvent.type(input, "tritanium{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent('There is already an item called "Tritanium".');
    expect(input).toHaveValue("tritanium");
  });

  it("changes an item's category at once", async () => {
    const { store } = renderItems();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Category of Tritanium" }), "Components");
    await vi.waitFor(() => expect(store.current.items.categories.get("Components")).toContain("Tritanium"));
    expect(screen.getByRole("combobox", { name: "Category of Tritanium" })).toHaveValue("Components");
  });

  it("refuses to delete an item recipes use, naming them", async () => {
    renderItems();
    await userEvent.click(screen.getByRole("button", { name: "Delete Robotics" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/^"Robotics" cannot be deleted: \d+ recipes use it - .*Robotics/);
    expect(screen.getByRole("cell", { name: "Robotics" })).toBeInTheDocument();
  });

  it("refuses to delete an item that holds stock, stating the quantity", async () => {
    renderItems();
    await userEvent.click(screen.getByRole("button", { name: "Delete 'Arbalest' Cruise Launcher I" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `"'Arbalest' Cruise Launcher I" cannot be deleted: 12 of it is in the hangar. Remove its stock in the Hangar section first.`,
    );
  });
});
