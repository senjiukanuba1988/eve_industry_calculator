import { useState } from "react";
import type { ConversionReport } from "../app/startup";
import type { DataStore } from "../app/store";
import type { DataFolder } from "../storage/fileSystem";
import { ConfirmProvider } from "./ConfirmDialog";
import { StoreContext } from "./context";
import { Shell } from "./Shell";

interface AppProps {
  folder: DataFolder;
  store: DataStore;
  /** Present on the one start that converted the data. */
  conversion?: ConversionReport;
}

/** The running application, once the data is loaded. */
export function App({ folder, store, conversion }: AppProps) {
  return (
    <StoreContext.Provider value={store}>
      <ConfirmProvider>
        <Shell folder={folder} banner={conversion && <ConversionNotice report={conversion} folder={folder} />} />
      </ConfirmProvider>
    </StoreContext.Provider>
  );
}

function ConversionNotice({ report, folder }: { report: ConversionReport; folder: DataFolder }) {
  const [open, setOpen] = useState(true);
  if (!open) {
    return null;
  }
  return (
    <section className="notice" role="status">
      <p>
        Your data was converted from format {report.from} (last written by {report.writtenBy}) to format {report.to} so this version can use
        it. A copy of the files as they were is in <code>{report.backupFolder.replaceAll("/", "\\")}</code>.
      </p>
      <ul>
        {report.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ul>
      <div className="actions">
        <button type="button" onClick={() => void folder.open(report.backupFolder)}>
          Open backup folder
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          OK
        </button>
      </div>
    </section>
  );
}
