import { render, screen } from "@testing-library/react";
import { APP_VERSION } from "../appInfo";
import { App } from "./App";

describe("App", () => {
  it("shows the app name and version", () => {
    render(<App runtime="desktop" />);
    expect(screen.getByRole("heading", { name: "EVE Industry Calculator" })).toBeInTheDocument();
    expect(screen.getByText(`Version ${APP_VERSION} · desktop`)).toBeInTheDocument();
  });

  it("says when it runs in the browser", () => {
    render(<App runtime="browser" />);
    expect(screen.getByText(/browser \(development\)/)).toBeInTheDocument();
  });
});
