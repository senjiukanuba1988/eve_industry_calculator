import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createQueue } from "../app/oneAtATime";
import { DataStore } from "../app/store";
import { emptyData } from "../core/data/format";
import type { AppData, Plan, Recipe } from "../core/data/model";
import type { DataFolder } from "../storage/fileSystem";
import { MemoryFileSystem } from "../storage/memoryFileSystem";
import { App } from "./App";

const recipe: Recipe = {
  product: "Robotics",
  type: "Planetary Industry",
  output: 1,
  inputs: new Map([
    ["Consumer Electronics", 10],
    ["Mechanical Parts", 10],
  ]),
};

function plan(name: string, completed?: string): Plan {
  return {
    name,
    target: { product: "Robotics" },
    runs: 6,
    created: "2026-10-04T16:32:05+02:00",
    completed,
    variantChoices: new Map(),
    steps: [],
  };
}

function withRecipe(plans: Plan[] = []): AppData {
  const data = emptyData("1.0.0");
  return {
    ...data,
    items: { categories: new Map(), uncategorised: ["Consumer Electronics", "Mechanical Parts", "Robotics"] },
    recipes: [recipe],
    plans,
  };
}

function renderApp(data: AppData) {
  const folder: DataFolder = {
    fs: new MemoryFileSystem(),
    path: "C:\\Users\\me\\Documents\\EVE Industry Calculator",
    open: vi.fn(async () => undefined),
  };
  const store = new DataStore(folder.fs, data, { appVersion: "1.0.0", queue: createQueue() });
  render(<App folder={folder} store={store} />);
  return { folder };
}

const itemsTable = () => screen.getByRole("columnheader", { name: "Item" }).closest("table")!;

const nav = () => within(screen.getByRole("navigation", { name: "Sections" }));

describe("Shell", () => {
  it("starts on Plans, listing the incomplete plans only", () => {
    renderApp(withRecipe([plan("6 Robotics"), plan("Old run", "2026-10-03T10:00:00+02:00")]));
    expect(nav().getByRole("button", { name: /Plans/ })).toHaveAttribute("aria-current", "page");
    const plans = screen.getByRole("region", { name: "Plans" });
    expect(within(plans).getByRole("cell", { name: "6 Robotics" })).toBeInTheDocument();
    expect(within(plans).queryByRole("cell", { name: "Old run" })).not.toBeInTheDocument();
  });

  it("with recipes but no open plan, offers the recipes to plan from", () => {
    renderApp(withRecipe([plan("Old run", "2026-10-03T10:00:00+02:00")]));
    const plans = screen.getByRole("region", { name: "Plans" });
    expect(within(plans).getByText(/No open plans/)).toBeInTheDocument();
    expect(within(plans).getByRole("cell", { name: "Robotics" })).toBeInTheDocument();
  });

  it("with nothing at all, explains plans and leads to the first recipe", async () => {
    renderApp(emptyData("1.0.0"));
    const plans = screen.getByRole("region", { name: "Plans" });
    expect(within(plans).getByText(/A plan works out everything a build needs/)).toBeInTheDocument();
    await userEvent.click(within(plans).getByRole("button", { name: "Create the first recipe" }));
    expect(nav().getByRole("button", { name: /Recipes/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("region", { name: "Recipes" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Plans" })).not.toBeInTheDocument();
  });

  it("keeps a section as it was while another one is shown", async () => {
    renderApp(withRecipe());
    await userEvent.click(nav().getByRole("button", { name: /Items/ }));
    await userEvent.type(screen.getByRole("searchbox", { name: "Search items" }), "robo");
    expect(within(itemsTable()).getAllByRole("row")).toHaveLength(2);

    await userEvent.click(nav().getByRole("button", { name: /Recipes/ }));
    await userEvent.click(nav().getByRole("button", { name: /Items/ }));

    expect(screen.getByRole("searchbox", { name: "Search items" })).toHaveValue("robo");
    expect(within(itemsTable()).getAllByRole("row")).toHaveLength(2);
  });

  it("shows counts in the sidebar", () => {
    renderApp(withRecipe([plan("6 Robotics")]));
    expect(nav().getByRole("button", { name: /^Plans\s*1$/ })).toBeInTheDocument();
    expect(nav().getByRole("button", { name: /^Recipes\s*1$/ })).toBeInTheDocument();
    expect(nav().getByRole("button", { name: /^Items\s*3$/ })).toBeInTheDocument();
  });

  it("shows the data folder with its full path, a way to open it, and the edit-while-closed note", async () => {
    const { folder } = renderApp(emptyData("1.0.0"));
    await userEvent.click(nav().getByRole("button", { name: "Data folder" }));
    const panel = screen.getByRole("region", { name: "Data folder" });
    expect(within(panel).getByText("C:\\Users\\me\\Documents\\EVE Industry Calculator")).toBeInTheDocument();
    expect(within(panel).getByText(/Edit these files only while EVE Industry Calculator is closed/)).toBeInTheDocument();
    await userEvent.click(within(panel).getByRole("button", { name: "Open data folder" }));
    expect(folder.open).toHaveBeenCalled();
  });
});
