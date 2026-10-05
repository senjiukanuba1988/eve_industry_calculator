import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../../app/oneAtATime";
import { DataStore } from "../../app/store";
import { emptyData } from "../../core/data/format";
import { MemoryFileSystem } from "../../storage/memoryFileSystem";
import { StoreContext } from "../context";
import { CategoriesPanel } from "./CategoriesPanel";

function renderPanel(categories: Record<string, string[]> = {}) {
  const data = { ...emptyData("1.0.0"), items: { categories: new Map(Object.entries(categories)), uncategorised: [] } };
  const fs = MemoryFileSystem.withFiles({});
  const store = new DataStore(fs, data, { appVersion: "1.0.0", queue: createQueue() });
  render(
    <StoreContext.Provider value={store}>
      <CategoriesPanel />
    </StoreContext.Provider>,
  );
  return { store, fs };
}

const row = (name: string) => screen.getByRole("cell", { name }).closest("tr")!;

describe("CategoriesPanel", () => {
  it("creates a category, which appears at once and is saved", async () => {
    const { fs } = renderPanel();
    await userEvent.type(screen.getByRole("textbox", { name: "New category" }), "Minerals{Enter}");
    expect(await screen.findByRole("cell", { name: "Minerals" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "New category" })).toHaveValue("");
    expect(fs.snapshot()["items.json"]).toContain('"Minerals": []');
  });

  it("rejects a duplicate in place, keeping what was typed", async () => {
    renderPanel({ Minerals: [] });
    await userEvent.type(screen.getByRole("textbox", { name: "New category" }), "minerals{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent('There is already a category called "Minerals".');
    expect(screen.getByRole("textbox", { name: "New category" })).toHaveValue("minerals");
    expect(screen.getAllByRole("cell", { name: /minerals/i })).toHaveLength(1);
  });

  it("refuses to delete a category in use, stating the count, and offers to move the items out first", async () => {
    const { store } = renderPanel({ Minerals: ["Tritanium", "Pyerite"] });

    await userEvent.click(screen.getByRole("button", { name: "Delete Minerals" }));
    expect(await screen.findByRole("alert")).toHaveTextContent('2 items belong to "Minerals", so it cannot be deleted.');
    expect(store.current.items.categories.get("Minerals")).toEqual(["Tritanium", "Pyerite"]);

    await userEvent.click(screen.getByRole("button", { name: "Move them to no category" }));
    expect(await within(row("Minerals")).findByRole("cell", { name: "0" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(store.current.items.uncategorised).toEqual(["Tritanium", "Pyerite"]);

    await userEvent.click(screen.getByRole("button", { name: "Delete Minerals" }));
    await vi.waitFor(() => expect(screen.queryByRole("cell", { name: "Minerals" })).not.toBeInTheDocument());
  });

  it("deletes an empty category", async () => {
    const { store } = renderPanel({ Ships: [] });
    await userEvent.click(screen.getByRole("button", { name: "Delete Ships" }));
    await vi.waitFor(() => expect(store.current.items.categories.size).toBe(0));
  });

  it("renames in place; Escape cancels", async () => {
    renderPanel({ Minerals: ["Tritanium"] });
    await userEvent.click(screen.getByRole("button", { name: "Rename Minerals" }));
    const input = screen.getByRole("textbox", { name: "New name for Minerals" });
    await userEvent.keyboard("{Escape}");
    expect(input).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Rename Minerals" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "New name for Minerals" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New name for Minerals" }), "Ore Minerals{Enter}");
    expect(await screen.findByRole("cell", { name: "Ore Minerals" })).toBeInTheDocument();
    expect(within(row("Ore Minerals")).getByRole("cell", { name: "1" })).toBeInTheDocument();
  });

  it("rejects renaming to another category's name, keeping the edit open", async () => {
    renderPanel({ Minerals: [], Ships: [] });
    await userEvent.click(screen.getByRole("button", { name: "Rename Ships" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "New name for Ships" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New name for Ships" }), "MINERALS{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent('There is already a category called "Minerals".');
    expect(screen.getByRole("textbox", { name: "New name for Ships" })).toHaveValue("MINERALS");
  });
});
