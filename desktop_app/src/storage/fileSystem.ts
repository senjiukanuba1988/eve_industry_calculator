// The storage interface: plain file operations inside the data folder. Paths are relative
// to the folder's root and use "/" as separator. Adapters: the Tauri one for real files,
// an in-memory one for tests, and a browser one for `npm run dev:browser`.

export interface Entry {
  name: string;
  isDir: boolean;
}

export interface FileSystem {
  /** The file's text, or undefined if it does not exist. */
  readText(path: string): Promise<string | undefined>;
  /** Creates or overwrites the file; it is on disk when this resolves. The folder must exist. */
  writeText(path: string, text: string): Promise<void>;
  /** Renames a file, replacing the target if it exists. Fails if the source does not exist. */
  rename(from: string, to: string): Promise<void>;
  /** Deletes a file; one that does not exist counts as deleted. */
  remove(path: string): Promise<void>;
  /** Files and folders directly inside a folder, sorted by name; empty if it does not exist. */
  list(path: string): Promise<Entry[]>;
  /** Copies a file byte for byte. */
  copy(from: string, to: string): Promise<void>;
  /** Creates a folder and any missing parents. */
  createDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

/** The data folder: its files, where it is, and a way to show it to the user. */
export interface DataFolder {
  fs: FileSystem;
  /** The full path, shown to the user. */
  path: string;
  /** Opens the folder, or a folder inside it, in the system file browser. */
  open(subfolder?: string): Promise<void>;
}
