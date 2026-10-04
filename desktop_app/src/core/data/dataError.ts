/**
 * One reason the data folder cannot be used: which file, where in it, and what was
 * found compared with what was expected there.
 */
export interface DataError {
  /** One of the current data files, or a file of an older format being converted. */
  file: string;
  /** The line the problem can be pinned to. Absent for a file that is missing altogether. */
  line?: number;
  /** Where in the file's structure, e.g. `recipes[3].inputs["Sulfuric Acid"]`. Absent where meaningless. */
  path?: string;
  message: string;
}

export function formatDataError(error: DataError): string {
  const where = error.line !== undefined ? ` line ${error.line}` : "";
  return `${error.file}${where}: ${error.message}`;
}
