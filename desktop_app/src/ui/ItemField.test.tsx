import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createQueue } from "../app/oneAtATime";
import { DataStore } from "../app/store";
import { fixtureTexts } from "../core/data/fixtures/fixture";
import { loadData } from "../core/data/load";
import { MemoryFileSystem } from "../storage/memoryFileSystem";
import { StoreContext } from "./context";
import { ItemField, type ItemFieldValue } from "./ItemField";

/** The field in a form, showing what it is bound to; submitting the form is recorded. */
function Harness({ onSubmit }: { onSubmit: () => void }) {
  const [value, setValue] = useState<ItemFieldValue>({ text: "" });
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <ItemField label="Input 1" value={value} onChange={setValue} />
      <output aria-label="Bound to">{value.item ?? "(nothing)"}</output>
    </form>
  );
}

function renderField() {
  const loaded = loadData(fixtureTexts());
  if (!loaded.ok) {
    throw new Error("fixture does not load");
  }
  const store = new DataStore(MemoryFileSystem.withFiles(fixtureTexts() as Record<string, string>), loaded.data, {
    appVersion: "1.0.0",
    queue: createQueue(),
  });
  const onSubmit = vi.fn();
  render(
    <StoreContext.Provider value={store}>
      <Harness onSubmit={onSubmit} />
    </StoreContext.Provider>,
  );
  return { store, onSubmit, field: screen.getByRole("combobox", { name: "Input 1" }) };
}

const bound = () => screen.getByRole("status", { name: "Bound to" });
const options = () => within(screen.getByRole("listbox")).getAllByRole("option");

describe("ItemField", () => {
  it("offers items containing the typed text, each with its category", async () => {
    const { field } = renderField();
    await userEvent.type(field, "Robo");
    expect(options().map((o) => o.textContent)).toEqual(["RoboticsPlanetary P3", "Create item Robo…"]);
    expect(bound()).toHaveTextContent("(nothing)");
  });

  it("binds to a suggestion chosen with the mouse", async () => {
    const { field } = renderField();
    await userEvent.type(field, "robo");
    await userEvent.click(screen.getByRole("option", { name: /^Robotics/ }));
    expect(field).toHaveValue("Robotics");
    expect(bound()).toHaveTextContent("Robotics");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("binds with the keyboard: arrows move, Enter chooses without submitting the form", async () => {
    const { field, onSubmit } = renderField();
    await userEvent.type(field, "acolyte");
    expect(options()[0]).toHaveAttribute("aria-selected", "true");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(bound()).toHaveTextContent("Acolyte II");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("wraps around with the arrows", async () => {
    const { field } = renderField();
    await userEvent.type(field, "acolyte");
    await userEvent.keyboard("{ArrowUp}");
    expect(options().at(-1)).toHaveAttribute("aria-selected", "true");
    expect(field).toHaveAttribute("aria-activedescendant", options().at(-1)!.id);
  });

  it("binds when the full name is typed, in any case, and unbinds when it is changed again", async () => {
    const { field } = renderField();
    await userEvent.type(field, "tritanium");
    expect(bound()).toHaveTextContent("Tritanium");
    await userEvent.type(field, "x");
    expect(bound()).toHaveTextContent("(nothing)");
  });

  it("closes the suggestions on Escape, keeping the text", async () => {
    const { field } = renderField();
    await userEvent.type(field, "robo{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(field).toHaveValue("robo");
    await userEvent.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("creates an item that does not exist yet, in a chosen category, and binds to it", async () => {
    const { field, store } = renderField();
    await userEvent.type(field, "Nocxium ");
    expect(options()).toHaveLength(1);
    await userEvent.keyboard("{Enter}");

    const create = screen.getByRole("group", { name: "Create item Nocxium" });
    await userEvent.selectOptions(within(create).getByRole("combobox", { name: "Category for the new item" }), "Minerals");
    await userEvent.click(within(create).getByRole("button", { name: "Create" }));

    await vi.waitFor(() => expect(bound()).toHaveTextContent("Nocxium"));
    expect(field).toHaveValue("Nocxium");
    expect(store.current.items.categories.get("Minerals")).toContain("Nocxium");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(field).toHaveFocus();
  });

  it("creates with no category straight from the keyboard: Enter, Enter", async () => {
    const { field, store, onSubmit } = renderField();
    await userEvent.type(field, "Nocxium{Enter}");
    await userEvent.keyboard("{Enter}");
    await vi.waitFor(() => expect(bound()).toHaveTextContent("Nocxium"));
    expect(store.current.items.uncategorised).toContain("Nocxium");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("cancels creating with Escape, keeping the text unbound", async () => {
    const { field, store } = renderField();
    await userEvent.type(field, "Nocxium{Enter}");
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
    expect(field).toHaveValue("Nocxium");
    expect(bound()).toHaveTextContent("(nothing)");
    expect(store.current.items.uncategorised).not.toContain("Nocxium");
  });

  it("does not offer to create a name that exists", async () => {
    const { field } = renderField();
    await userEvent.type(field, "robotics");
    expect(options().map((o) => o.textContent)).toEqual(["RoboticsPlanetary P3"]);
  });
});
