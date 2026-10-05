import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StartupResult } from "../app/startup";
import { APP_VERSION } from "../appInfo";
import { emptyData } from "../core/data/format";
import type { DataFolder } from "../storage/fileSystem";
import { MemoryFileSystem } from "../storage/memoryFileSystem";
import { Startup } from "./Startup";

function folder(): DataFolder & { open: ReturnType<typeof vi.fn> } {
  return { fs: new MemoryFileSystem(), path: "C:\\Users\\me\\Documents\\EVE Industry Calculator", open: vi.fn(async () => undefined) };
}

function renderWith(...results: StartupResult[]) {
  const start = vi.fn<() => Promise<StartupResult>>();
  for (const result of results) {
    start.mockResolvedValueOnce(result);
  }
  const dataFolder = folder();
  render(<Startup folder={dataFolder} start={start} />);
  return { start, dataFolder };
}

describe("Startup", () => {
  it("shows the application once the data is ready", async () => {
    renderWith({ kind: "ready", data: emptyData("1.0.0") });
    expect(await screen.findByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Plans" })).toBeInTheDocument();
  });

  it("shows malformed data with file and line, and nothing else", async () => {
    renderWith({
      kind: "malformed",
      errors: [{ file: "recipes.json", line: 214, message: 'input "Sulfuric Acd" is not an item in items.json' }],
    });
    expect(await screen.findByRole("heading", { name: "Your data could not be read" })).toBeInTheDocument();
    expect(screen.getByText('recipes.json line 214: input "Sulfuric Acd" is not an item in items.json')).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been changed/)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Sections" })).not.toBeInTheDocument();
  });

  it("offers to open the data folder, showing its full path", async () => {
    const { dataFolder } = renderWith({ kind: "malformed", errors: [{ file: "items.json", line: 3, message: "x" }] });
    await userEvent.click(await screen.findByRole("button", { name: "Open data folder" }));
    expect(dataFolder.open).toHaveBeenCalled();
    expect(screen.getByText("C:\\Users\\me\\Documents\\EVE Industry Calculator")).toBeInTheDocument();
  });

  it("tries again, and starts once the data has been fixed", async () => {
    const { start } = renderWith(
      { kind: "malformed", errors: [{ file: "items.json", line: 3, message: "x" }] },
      { kind: "ready", data: emptyData("1.0.0") },
    );
    await userEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("navigation", { name: "Sections" })).toBeInTheDocument();
    expect(start).toHaveBeenCalledTimes(2);
  });

  it("refuses newer data, naming both versions, with no way to try again", async () => {
    renderWith({ kind: "newer", formatVersion: 3, writtenBy: "1.4.0" });
    expect(
      await screen.findByText(
        `This data was written by EVE Industry Calculator 1.4.0, which arranges it in a newer way than this version (${APP_VERSION}) understands. Install 1.4.0 or later to open it. Nothing has been changed.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open data folder" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("explains a failed conversion, its step, and that the files are unchanged", async () => {
    renderWith({
      kind: "conversionFailed",
      from: 1,
      to: 3,
      step: "Recipes gain a facility field",
      errors: ["plans.json → plans[2].runs: expected a whole number"],
    });
    expect(await screen.findByRole("heading", { name: "Your data could not be converted from format 1 to format 3" })).toBeInTheDocument();
    expect(screen.getByText("The step that failed: Recipes gain a facility field.")).toBeInTheDocument();
    expect(screen.getByText("plans.json → plans[2].runs: expected a whole number")).toBeInTheDocument();
    expect(screen.getByText("Your files are unchanged.")).toBeInTheDocument();
  });

  it("shows the one-off conversion message, which can open the backup and be dismissed", async () => {
    const { dataFolder } = renderWith({
      kind: "ready",
      data: emptyData("1.0.0"),
      conversion: { from: 1, to: 3, writtenBy: "1.2.0", backupFolder: "backups/format 1 to 3 - 2026-10-04 16-32", steps: ["A", "B"] },
    });
    expect(await screen.findByText(/Your data was converted from format 1 \(last written by 1.2.0\) to format 3/)).toBeInTheDocument();
    expect(screen.getByText("backups\\format 1 to 3 - 2026-10-04 16-32")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open backup folder" }));
    expect(dataFolder.open).toHaveBeenCalledWith("backups/format 1 to 3 - 2026-10-04 16-32");
    await userEvent.click(screen.getByRole("button", { name: "OK" }));
    expect(screen.queryByText(/Your data was converted/)).not.toBeInTheDocument();
  });
});
