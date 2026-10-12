import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../../app/oneAtATime";
import { DataStore } from "../../app/store";
import { fixtureTexts } from "../../core/data/fixtures/fixture";
import { loadData } from "../../core/data/load";
import type { DataFolder } from "../../storage/fileSystem";
import { MemoryFileSystem } from "../../storage/memoryFileSystem";
import { App } from "../App";

function renderHangar() {
  const loaded = loadData(fixtureTexts());
  if (!loaded.ok) {
    throw new Error("fixture does not load");
  }
  const folder: DataFolder = { fs: MemoryFileSystem.withFiles(fixtureTexts() as Record<string, string>), path: "C:\\data", open: vi.fn() };
  const store = new DataStore(folder.fs, loaded.data, { appVersion: "1.0.0", queue: createQueue() });
  render(<App folder={folder} store={store} />);
  return { store };
}

async function showHangar() {
  await userEvent.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: /^Hangar/ }));
}

const row = (item: string) => screen.getByRole("cell", { name: new RegExp(`^${item}`) }).closest("tr")!;
const cells = (item: string) =>
  within(row(item))
    .getAllByRole("cell")
    .map((c) => c.textContent);

describe("HangarSection", () => {
  it("shows available, reserved and total, and names the plan holding the reservation", async () => {
    renderHangar();
    await showHangar();
    expect(cells("Construction Blocks").slice(0, 5)).toEqual(["Construction Blocks", "Components", "500", "2,000", "2,500"]);

    await userEvent.click(screen.getByRole("button", { name: "Reserved Construction Blocks" }));
    expect(screen.getByText(/Reserved material cannot be edited here/)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Hangar" })).getByText("80 Flycatchers")).toBeInTheDocument();
  });

  it("releases a reservation from the explanation", async () => {
    const { store } = renderHangar();
    await showHangar();
    await userEvent.click(screen.getByRole("button", { name: "Reserved Construction Blocks" }));
    await userEvent.click(screen.getByRole("button", { name: "Release 80 Flycatchers's reservation" }));
    await vi.waitFor(() => expect(cells("Construction Blocks").slice(2, 5)).toEqual(["2,500", "", "2,500"]));
    expect(store.current.plans[0]!.reserved).toBeUndefined();
  });

  it("pastes stock, adding to what is held, and shows what was added, ignored and skipped", async () => {
    const { store } = renderHangar();
    await showHangar();
    await userEvent.click(screen.getByRole("button", { name: "Paste stock" }));
    // Pasting, rather than typing, so the tabs arrive as they would from the game.
    fireEvent.change(screen.getByRole("textbox", { name: "Pasted text" }), {
      target: { value: "Sulfuric Acid\t1,000\tMoon Material\t10.00 m3\nLarge Shield Extender II\t3\nRifter\tFrigate" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Add to hangar" }));

    const summary = await screen.findByRole("status", { name: "Paste summary" });
    expect(within(summary).getByRole("heading", { level: 2 })).toHaveTextContent("Added 1 item, ignored 1, skipped 1 line");
    expect(within(summary).getByText("+1,000")).toBeInTheDocument();
    expect(within(summary).getByText("not relevant for industry")).toBeInTheDocument();
    expect(within(summary).getByText("Rifter\tFrigate", { normalizer: (s) => s })).toBeInTheDocument();
    expect(store.current.hangar.stock.get("Sulfuric Acid")).toBe(1098);

    await userEvent.click(within(summary).getByRole("button", { name: "OK" }));
    expect(screen.queryByRole("status", { name: "Paste summary" })).not.toBeInTheDocument();
    expect(store.current.hangar.stock.get("Sulfuric Acid")).toBe(1098);
  });

  it("marks stock no recipe uses", async () => {
    renderHangar();
    await showHangar();
    expect(within(row("Tritanium")).getByText("not used by any recipe")).toBeInTheDocument();
    expect(within(row("Sulfuric Acid")).queryByText("not used by any recipe")).not.toBeInTheDocument();
  });

  it("corrects an available quantity by hand", async () => {
    const { store } = renderHangar();
    await showHangar();
    await userEvent.click(screen.getByRole("button", { name: "Correct Tritanium" }));
    const input = screen.getByRole("textbox", { name: "Available Tritanium" });
    await userEvent.clear(input);
    await userEvent.type(input, "4,750{Enter}");
    await vi.waitFor(() => expect(store.current.hangar.stock.get("Tritanium")).toBe(4750));
    expect(cells("Tritanium")[2]).toBe("4,750");
  });

  it("refuses a correction that is not a whole number, in the row, keeping the input", async () => {
    renderHangar();
    await showHangar();
    await userEvent.click(screen.getByRole("button", { name: "Correct Tritanium" }));
    const input = screen.getByRole("textbox", { name: "Available Tritanium" });
    await userEvent.clear(input);
    await userEvent.type(input, "lots{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a whole number of 0 or more.");
    expect(input).toHaveValue("lots");
  });

  it("removes an item's available stock after confirmation, leaving reserved stock with its plan", async () => {
    const { store } = renderHangar();
    await showHangar();
    await userEvent.click(screen.getByRole("button", { name: "Remove Construction Blocks" }));
    const dialog = screen.getByRole("alertdialog", { name: "Remove Construction Blocks from the hangar?" });
    expect(dialog).toHaveTextContent("The 2,000 reserved by plans stay with them.");
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove stock" }));
    await vi.waitFor(() => expect(store.current.hangar.stock.has("Construction Blocks")).toBe(false));
    expect(cells("Construction Blocks").slice(2, 5)).toEqual(["0", "2,000", "2,000"]);
  });

  it("narrows by search and category", async () => {
    renderHangar();
    await showHangar();
    await userEvent.type(screen.getByRole("searchbox", { name: "Search stock" }), "trit");
    expect(screen.getAllByRole("row")).toHaveLength(2);
    await userEvent.clear(screen.getByRole("searchbox", { name: "Search stock" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Filter stock by category" }), "Moon Materials");
    expect(cells("Sulfuric Acid")[0]).toBe("Sulfuric Acid");
    expect(screen.queryByRole("cell", { name: "Tritanium" })).not.toBeInTheDocument();
  });

  it("resets the hangar after a confirmation stating exactly what is lost", async () => {
    const { store } = renderHangar();
    await showHangar();
    await userEvent.click(screen.getByRole("button", { name: "Reset hangar" }));
    const dialog = screen.getByRole("alertdialog", { name: "Reset the hangar?" });
    expect(dialog).toHaveTextContent("All stock is cleared: 4 items.");
    expect(dialog).toHaveTextContent("reserved materials are cleared with the rest: 80 Flycatchers.");
    expect(dialog).toHaveTextContent("80 Flycatchers (1 started, 1 done)");
    expect(dialog).toHaveTextContent("Completed plans are not touched.");

    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(store.current.hangar.stock.size).toBe(4);

    await userEvent.click(screen.getByRole("button", { name: "Reset hangar" }));
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Reset hangar" }));
    await vi.waitFor(() => expect(store.current.hangar.stock.size).toBe(0));
    expect(store.current.plans[0]).toMatchObject({ reserved: undefined, steps: [] });
    expect(store.current.plans[1]!.completed).toBeDefined();
  });
});
