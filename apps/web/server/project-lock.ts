import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";

/**
 * A per-project promise queue.
 *
 * Every read-modify-write of a project's `project.json` or `takes.json` that
 * touches the media reference or its revision runs inside `withProjectLock`, so
 * two concurrent operations (an import and a take upload, a transcript save
 * racing a media replacement) cannot each read a stale document and write it
 * back. The queue is keyed by the resolved project root, so one project never
 * blocks another.
 *
 * The lock is not re-entrant. A section must not await another section for the
 * same root: the inner section would wait for the outer section, which waits
 * for the inner one. Such a nested call throws instead of deadlocking. Locking
 * a different root from inside a section is allowed.
 */

type LockedSection = Promise<void>;

const queues = new Map<string, LockedSection>();

/** The roots whose sections are running in the current async context. */
const heldRoots = new AsyncLocalStorage<Set<string>>();

/**
 * Runs `fn` after the previous section for `root` settles, whatever its
 * outcome, and returns `fn`'s result (or rejects with `fn`'s error).
 *
 * Throws when `fn`'s context already holds a section for `root`.
 */
export function withProjectLock<T>(root: string, fn: () => T | Promise<T>): Promise<T> {
  const key = path.resolve(root);
  const held = heldRoots.getStore();
  if (held !== undefined && held.has(key)) {
    throw new Error(`withProjectLock is not re-entrant: ${key}`);
  }

  const previous = queues.get(key) ?? Promise.resolve();
  const next = new Set(held);
  next.add(key);

  // The rejection handler runs `fn` too, so a throwing section never poisons
  // the next one. `fn` runs inside the held-root set, so a nested lock for the
  // same root is detected at call time.
  const run = previous.then(
    () => heldRoots.run(next, fn),
    () => heldRoots.run(next, fn),
  );
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
