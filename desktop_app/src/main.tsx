import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueue, oneAtATime } from "./app/oneAtATime";
import { startUp } from "./app/startup";
import { APP_VERSION } from "./appInfo";
import { openDataFolder } from "./storage";
import { detectRuntime } from "./storage/runtime";
import { Startup } from "./ui/Startup";
import "./ui/global.css";

const root = createRoot(document.getElementById("root") as HTMLElement);

openDataFolder(detectRuntime()).then(
  (folder) => {
    // Everything that writes to the data folder shares one queue. Start-up runs in it too:
    // React's StrictMode runs effects twice in development, and "Try again" can be pressed
    // while a start is still running.
    const queue = createQueue();
    const start = oneAtATime(() => startUp(folder.fs, { appVersion: APP_VERSION, now: () => new Date() }), queue);
    root.render(
      <StrictMode>
        <Startup folder={folder} start={start} queue={queue} />
      </StrictMode>,
    );
  },
  (error: unknown) => {
    root.render(<p role="alert">The data folder could not be found: {String(error)}</p>);
  },
);
