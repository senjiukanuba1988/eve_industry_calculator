import { useState } from "react";
import type { ConversionReport } from "../app/startup";
import { APP_NAME, APP_VERSION } from "../appInfo";
import type { AppData } from "../core/data/model";
import type { DataFolder } from "../storage/fileSystem";

interface AppProps {
  folder: DataFolder;
  data: AppData;
  /** Present on the one start that converted the data. */
  conversion?: ConversionReport;
}

/** Placeholder until the application shell (task 13): shows that the data loaded. */
export function App({ folder, data, conversion }: AppProps) {
  return (
    <main>
      <h1>{APP_NAME}</h1>
      <p>Version {APP_VERSION}</p>
      {conversion && <ConversionNotice report={conversion} folder={folder} />}
      <p className="data-folder-path">
        Data folder: <code>{folder.path}</code>{" "}
        <button type="button" onClick={() => void folder.open()}>
          Open
        </button>
      </p>
      <p>
        {data.items.uncategorised.length + [...data.items.categories.values()].reduce((n, items) => n + items.length, 0)} items,{" "}
        {data.recipes.length} recipes, {data.hangar.stock.size} items in stock, {data.plans.length} plans.
      </p>
    </main>
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
        Your data was converted from format {report.from} (last written by {report.writtenBy}) to format {report.to} so this version can
        use it. A copy of the files as they were is in <code>{report.backupFolder.replaceAll("/", "\\")}</code>.
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
