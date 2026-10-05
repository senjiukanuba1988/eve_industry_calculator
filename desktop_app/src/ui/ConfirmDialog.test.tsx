import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ConfirmProvider } from "./ConfirmDialog";
import { useConfirm } from "./context";

/** A destructive action guarded by a confirmation, as later sections will use it. */
function ResetButton() {
  const confirm = useConfirm();
  const [answer, setAnswer] = useState<string>("none");
  const reset = async () => {
    const confirmed = await confirm({
      title: "Reset the hangar?",
      consequences: ["All stock is cleared.", "Reserved materials of 2 plans are released."],
      confirmLabel: "Reset hangar",
    });
    setAnswer(confirmed ? "confirmed" : "cancelled");
  };
  return (
    <>
      <button type="button" onClick={() => void reset()}>
        Reset
      </button>
      <output>{answer}</output>
    </>
  );
}

function renderReset() {
  render(
    <ConfirmProvider>
      <ResetButton />
    </ConfirmProvider>,
  );
}

describe("ConfirmDialog", () => {
  it("states the specific consequences, with an action-named confirm button", async () => {
    renderReset();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    const dialog = screen.getByRole("alertdialog", { name: "Reset the hangar?" });
    expect(dialog).toHaveAccessibleDescription(/^All stock is cleared\.\s*Reserved materials of 2 plans are released\.$/);
    expect(screen.getByRole("button", { name: "Reset hangar" })).toBeInTheDocument();
  });

  it("goes ahead only when confirmed", async () => {
    renderReset();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(screen.getByRole("button", { name: "Reset hangar" }));
    expect(screen.getByRole("status")).toHaveTextContent("confirmed");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does nothing on Cancel", async () => {
    renderReset();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("status")).toHaveTextContent("cancelled");
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("does nothing on Escape", async () => {
    renderReset();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("status")).toHaveTextContent("cancelled");
  });

  it("has Cancel focused, so pressing Enter straight away does not destroy anything", async () => {
    renderReset();
    await userEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("cancelled");
  });
});
