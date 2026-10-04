import { browserDataFolder } from "./browserDataFolder";
import type { DataFolder } from "./fileSystem";
import type { Runtime } from "./runtime";
import { tauriDataFolder } from "./tauriDataFolder";

export type { DataFolder, Entry, FileSystem } from "./fileSystem";

/** The data folder for where the app is running: real files on the desktop, localStorage in a browser. */
export function openDataFolder(runtime: Runtime): Promise<DataFolder> {
  return runtime === "desktop" ? tauriDataFolder() : Promise.resolve(browserDataFolder());
}
