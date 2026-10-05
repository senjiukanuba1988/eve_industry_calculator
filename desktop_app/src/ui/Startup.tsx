import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createQueue, type Queue } from "../app/oneAtATime";
import type { StartupResult } from "../app/startup";
import { DataStore } from "../app/store";
import { APP_NAME, APP_VERSION } from "../appInfo";
import { formatDataError } from "../core/data/dataError";
import type { DataFolder } from "../storage/fileSystem";
import { App } from "./App";

interface StartupProps {
  folder: DataFolder;
  /** Runs the start-up sequence; called again by "Try again". */
  start: () => Promise<StartupResult>;
  /** The queue every write to the data folder goes through; start-up uses it too. */
  queue?: Queue;
}

/** Runs the start-up sequence and shows either the application or why it cannot start. */
export function Startup({ folder, start, queue }: StartupProps) {
  const [result, setResult] = useState<StartupResult | undefined>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    void start().then((r) => current && setResult(r));
    return () => {
      current = false;
    };
  }, [start, attempt]);

  const run = useCallback(() => {
    setResult(undefined);
    setAttempt((a) => a + 1);
  }, []);

  const [fallbackQueue] = useState(createQueue);
  const store = useMemo(
    () => result?.kind === "ready" && new DataStore(folder.fs, result.data, { appVersion: APP_VERSION, queue: queue ?? fallbackQueue }),
    [result, folder, queue, fallbackQueue],
  );

  if (!result) {
    return <p className="startup-loading">Opening your data…</p>;
  }
  if (result.kind === "ready" && store) {
    return <App folder={folder} store={store} conversion={result.conversion} />;
  }

  const openFolder = () => void folder.open();
  const retry = (
    <button type="button" onClick={run}>
      Try again
    </button>
  );
  switch (result.kind) {
    case "malformed":
      return (
        <StartupError title="Your data could not be read" folder={folder} onOpenFolder={openFolder} retry={retry}>
          <p>
            Something in the data files is not as {APP_NAME} expects it, so it has not started. Nothing has been changed. Correct the file,
            then try again.
          </p>
          <ul className="startup-errors">
            {result.errors.map((error, i) => (
              <li key={i}>{formatDataError(error)}</li>
            ))}
          </ul>
        </StartupError>
      );
    case "newer":
      return (
        <StartupError title="Your data is from a newer version" folder={folder} onOpenFolder={openFolder}>
          <p>
            This data was written by {APP_NAME} {result.writtenBy}, which arranges it in a newer way than this version ({APP_VERSION})
            understands. Install {result.writtenBy} or later to open it. Nothing has been changed.
          </p>
        </StartupError>
      );
    case "conversionFailed":
      return (
        <StartupError
          title={`Your data could not be converted from format ${result.from} to format ${result.to}`}
          folder={folder}
          onOpenFolder={openFolder}
          retry={retry}
        >
          {result.step && <p>The step that failed: {result.step}.</p>}
          <ul className="startup-errors">
            {result.errors.map((error, i) => (
              <li key={i}>{error}</li>
            ))}
          </ul>
          <p>Your files are unchanged.</p>
        </StartupError>
      );
    case "failed":
      return (
        <StartupError title="Your data could not be opened" folder={folder} onOpenFolder={openFolder} retry={retry}>
          <p>{result.message}</p>
        </StartupError>
      );
  }
}

interface StartupErrorProps {
  title: string;
  folder: DataFolder;
  onOpenFolder: () => void;
  retry?: ReactNode;
  children: ReactNode;
}

function StartupError({ title, folder, onOpenFolder, retry, children }: StartupErrorProps) {
  return (
    <main className="startup-error" role="alert">
      <h1>{title}</h1>
      {children}
      <p className="data-folder-path">
        Data folder: <code>{folder.path}</code>
      </p>
      <div className="actions">
        <button type="button" onClick={onOpenFolder}>
          Open data folder
        </button>
        {retry}
      </div>
    </main>
  );
}
