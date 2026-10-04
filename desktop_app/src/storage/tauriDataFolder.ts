import { invoke } from "@tauri-apps/api/core";
import type { DataFolder, Entry, FileSystem } from "./fileSystem";

/** Real files, through the commands in src-tauri/src/lib.rs. */
const tauriFileSystem: FileSystem = {
  async readText(path) {
    return (await invoke<string | null>("read_text", { path })) ?? undefined;
  },
  writeText: (path, text) => invoke("write_text", { path, text }),
  rename: (from, to) => invoke("rename", { from, to }),
  remove: (path) => invoke("remove", { path }),
  list: (path) => invoke<Entry[]>("list", { path }),
  copy: (from, to) => invoke("copy", { from, to }),
  createDir: (path) => invoke("create_dir", { path }),
  exists: (path) => invoke<boolean>("exists", { path }),
};

export async function tauriDataFolder(): Promise<DataFolder> {
  return {
    fs: tauriFileSystem,
    path: await invoke<string>("data_folder"),
    open: (subfolder = "") => invoke("open_folder", { path: subfolder }),
  };
}
