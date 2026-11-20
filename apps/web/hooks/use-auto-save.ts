import { useEffect, useRef, useState } from "react";

/** Scheduling seam, so tests can decide when the debounce fires. */
export type SaveScheduler = {
  set(callback: () => void, delayMs: number): number;
  clear(handle: number): void;
};

const timeoutScheduler: SaveScheduler = {
  set(callback, delayMs) {
    return setTimeout(callback, delayMs) as unknown as number;
  },
  clear(handle) {
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>);
  },
};

export type UseAutoSaveOptions = {
  /** Whether the document has changes worth saving. */
  dirty: boolean;
  /** Any value that changes with each edit; restarts the debounce. */
  revision: unknown;
  save: () => Promise<void>;
  /** Quiet period before saving. */
  delayMs?: number;
  scheduler?: SaveScheduler;
  /** Called with the message of a failed save. */
  onError?: (message: string) => void;
};

/**
 * Saves a document once its edits settle.
 *
 * The timer restarts on every edit, so a burst of typing becomes one save. Only
 * one save runs at a time: an edit that arrives mid-save queues exactly one
 * follow-up instead of starting a second write against the same file.
 */
export function useAutoSave({
  dirty,
  revision,
  save,
  delayMs = 1500,
  scheduler = timeoutScheduler,
  onError,
}: UseAutoSaveOptions): { saving: boolean } {
  const [saving, setSaving] = useState(false);

  const saveRef = useRef(save);
  const onErrorRef = useRef(onError);
  const schedulerRef = useRef(scheduler);
  const runningRef = useRef(false);
  const queuedRef = useRef(false);

  useEffect(() => {
    saveRef.current = save;
    onErrorRef.current = onError;
    schedulerRef.current = scheduler;
  });

  useEffect(() => {
    if (!dirty) {
      return;
    }

    const run = () => {
      if (runningRef.current) {
        queuedRef.current = true;
        return;
      }

      runningRef.current = true;
      setSaving(true);

      void saveRef
        .current()
        .catch((error: unknown) => {
          onErrorRef.current?.(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          runningRef.current = false;
          setSaving(false);

          if (queuedRef.current) {
            queuedRef.current = false;
            run();
          }
        });
    };

    const handle = schedulerRef.current.set(run, delayMs);
    return () => schedulerRef.current.clear(handle);
  }, [dirty, revision, delayMs]);

  return { saving };
}
