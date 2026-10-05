import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { createQueue } from "../app/oneAtATime";
import { DataStore } from "../app/store";
import { emptyData } from "../core/data/format";
import { MemoryFileSystem } from "../storage/memoryFileSystem";
import { StoreContext, useAction, useAppData } from "./context";
import { Failure } from "./Failure";

/** A minimal form using the action pattern, as later sections will. */
function AddItemForm() {
  const data = useAppData();
  const action = useAction();
  const [name, setName] = useState("");
  const add = async () => {
    const result = await action.run((d) => ({ ...d, items: { ...d.items, uncategorised: [...d.items.uncategorised, name] } }));
    if (result.status === "saved") {
      setName("");
    }
  };
  return (
    <>
      <input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="button" onClick={() => void add()}>
        Add
      </button>
      <Failure action={action} />
      <ul>
        {data.items.uncategorised.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </>
  );
}

function renderForm() {
  const fs = MemoryFileSystem.withFiles({});
  const store = new DataStore(fs, emptyData("1.0.0"), { appVersion: "1.0.0", queue: createQueue() });
  render(
    <StoreContext.Provider value={store}>
      <AddItemForm />
    </StoreContext.Provider>,
  );
  return { fs };
}

describe("an action that fails to save", () => {
  it("is explained in place, keeps what was typed, and changes nothing on screen", async () => {
    const { fs } = renderForm();
    fs.failOn("writeText", new Error("the disk is full"));

    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Tritanium");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Not saved: the changes could not be saved: the disk is full");
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Tritanium");
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("shows the saved change once it is on disk", async () => {
    renderForm();
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Tritanium");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("listitem")).toHaveTextContent("Tritanium");
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
