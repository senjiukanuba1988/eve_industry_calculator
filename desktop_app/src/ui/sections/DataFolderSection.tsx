import { APP_NAME, APP_VERSION } from "../../appInfo";
import type { DataFolder } from "../../storage/fileSystem";

export function DataFolderSection({ folder }: { folder: DataFolder }) {
  return (
    <section aria-label="Data folder">
      <h1>Data folder</h1>
      <p>Everything {APP_NAME} knows - items, recipes, hangar stock and plans - is kept in readable files in this folder:</p>
      <p className="data-folder-path">
        <code>{folder.path}</code>
      </p>
      <div className="actions">
        <button type="button" onClick={() => void folder.open()}>
          Open data folder
        </button>
      </div>
      <p>Copying the folder is a complete backup. Installing a newer version leaves it alone.</p>
      <p className="warning">
        Edit these files only while {APP_NAME} is closed. Changes made while it is running are not seen by it, and its next save overwrites
        them.
      </p>
      <p className="muted">Version {APP_VERSION}</p>
    </section>
  );
}
