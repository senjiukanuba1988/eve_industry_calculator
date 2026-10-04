/** Key under which two names count as the same: case and surrounding whitespace ignored. */
export function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Sort order for names in the data files: alphabetical ignoring case, with an exact
 * comparison as tie-break so the order is total. Deliberately not localeCompare, whose
 * result depends on the machine's locale and would make files differ between machines.
 */
export function compareNames(a: string, b: string): number {
  const ka = a.toLowerCase();
  const kb = b.toLowerCase();
  if (ka !== kb) {
    return ka < kb ? -1 : 1;
  }
  return a === b ? 0 : a < b ? -1 : 1;
}

/** Map entries sorted by key, the order every name-keyed map is written in. */
export function sortedEntries<V>(map: ReadonlyMap<string, V>): Array<[string, V]> {
  return [...map.entries()].sort(([a], [b]) => compareNames(a, b));
}
