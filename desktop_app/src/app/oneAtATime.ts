/**
 * Wraps an async function so that calls never overlap: each waits for the previous one to
 * settle. Anything that writes to the data folder must run this way, since two commits in
 * flight at once would share the same temporary files.
 */
export function oneAtATime<T>(task: () => Promise<T>): () => Promise<T> {
  let previous: Promise<unknown> = Promise.resolve();
  return () => {
    const next = previous.then(task, task);
    previous = next.catch(() => undefined);
    return next;
  };
}
