import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { oneAtATime } from "./app/oneAtATime";
import { startUp } from "./app/startup";
import { APP_VERSION } from "./appInfo";
import { openDataFolder } from "./storage";
import { detectRuntime } from "./storage/runtime";
import { Startup } from "./ui/Startup";
import "./ui/global.css";

const root = createRoot(document.getElementById("root") as HTMLElement);

openDataFolder(detectRuntime()).then(
  (folder) => {
    // One at a time: React's StrictMode runs effects twice in development, and "Try again"
    // can be pressed while a start is still running.
    const start = oneAtATime(() => startUp(folder.fs, { appVersion: APP_VERSION, now: () => new Date() }));
    root.render(
      <StrictMode>
        <Startup folder={folder} start={start} />
      </StrictMode>,
    );
  },
  (error: unknown) => {
    root.render(<p role="alert">The data folder could not be found: {String(error)}</p>);
  },
);
