/** Runs each task it is given only after every earlier one has settled. */
export type Queue = <T>(task: () => Promise<T>) => Promise<T>;

/**
 * A queue that never lets two tasks overlap. Everything that writes to the data folder -
 * start-up and every later action - must go through one shared queue, since two commits
 * in flight at once would share the same temporary files.
 */
export function createQueue(): Queue {
  let previous: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>) => {
    const next = previous.then(task, task);
    previous = next.catch(() => undefined);
    return next;
  };
}

/** Wraps an async function so that calls never overlap: each waits for the previous one to settle. */
export function oneAtATime<T>(task: () => Promise<T>, queue: Queue = createQueue()): () => Promise<T> {
  return () => queue(task);
}
