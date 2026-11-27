import path from "node:path";

/**
 * A per-project promise queue.
 *
 * Every read-modify-write of a project's `project.json` that touches the media
 * reference or its revision runs inside `withProjectLock`, so two concurrent
 * operations (an import and a take upload, a transcript save racing a media
 * replacement) cannot each read a stale document and write it back. The queue
 * is keyed by the resolved project root, so one project never blocks another.
 */

type LockedSection = Promise<void>;

const queues = new Map<string, LockedSection>();

/**
 * Runs `fn` after the previous section for `root` settles, whatever its
 * outcome, and returns `fn`'s result (or rejects with `fn`'s error).
 */
export function withProjectLock<T>(root: string, fn: () => T | Promise<T>): Promise<T> {
  const key = path.resolve(root);
  const previous = queues.get(key) ?? Promise.resolve();

  // The rejection handler runs `fn` too, so a throwing section never poisons
  // the next one.
  const run = previous.then(fn, fn);
  const settled: LockedSection = run.then(
    () => undefined,
    () => undefined,
  );

  queues.set(key, settled);

  // Drop the entry once the queue drains, so the map does not leak.
  void settled.then(() => {
    if (queues.get(key) === settled) {
      queues.delete(key);
    }
  });

  return run;
}

/** Number of projects with a queued or running section; exposed for tests. */
export function pendingProjectLocks(): number {
  return queues.size;
}
