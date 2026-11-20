// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAutoSave, type SaveScheduler } from "./use-auto-save";

/** A scheduler the test advances by hand. */
class ManualScheduler implements SaveScheduler {
  private callbacks = new Map<number, () => void>();
  private next = 1;

  set(callback: () => void): number {
    const handle = this.next;
    this.next += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  clear(handle: number): void {
    this.callbacks.delete(handle);
  }

  get pending(): number {
    return this.callbacks.size;
  }

  flush(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) {
      callback();
    }
  }
}

describe("useAutoSave", () => {
  it("schedules nothing while the document is clean", () => {
    const scheduler = new ManualScheduler();
    const save = vi.fn(async () => undefined);

    renderHook(() =>
      useAutoSave({ dirty: false, revision: 0, save, scheduler, delayMs: 1500 }),
    );

    expect(scheduler.pending).toBe(0);
  });

  it("saves a dirty document once the delay passes", async () => {
    const scheduler = new ManualScheduler();
    const save = vi.fn(async () => undefined);

    const { result } = renderHook(() =>
      useAutoSave({ dirty: true, revision: 1, save, scheduler, delayMs: 1500 }),
    );

    expect(scheduler.pending).toBe(1);
    expect(save).not.toHaveBeenCalled();
    expect(result.current.saving).toBe(false);

    await act(async () => {
      scheduler.flush();
    });

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("restarts the timer when another edit lands", () => {
    const scheduler = new ManualScheduler();
    const save = vi.fn(async () => undefined);

    const { rerender } = renderHook(
      ({ revision }: { revision: number }) =>
        useAutoSave({ dirty: true, revision, save, scheduler, delayMs: 1500 }),
      { initialProps: { revision: 1 } },
    );

    rerender({ revision: 2 });

    expect(scheduler.pending).toBe(1);
    scheduler.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending save when the document becomes clean", () => {
    const scheduler = new ManualScheduler();
    const save = vi.fn(async () => undefined);

    const { rerender } = renderHook(
      ({ dirty }: { dirty: boolean }) =>
        useAutoSave({ dirty, revision: 1, save, scheduler, delayMs: 1500 }),
      { initialProps: { dirty: true } },
    );

    rerender({ dirty: false });

    expect(scheduler.pending).toBe(0);
    scheduler.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("queues one follow-up when an edit lands during a save", async () => {
    const scheduler = new ManualScheduler();
    let resolveFirst: () => void = () => undefined;
    const save = vi.fn((): Promise<void> => Promise.resolve());
    save.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const { rerender } = renderHook(
      ({ revision }: { revision: number }) =>
        useAutoSave({ dirty: true, revision, save, scheduler, delayMs: 1500 }),
      { initialProps: { revision: 1 } },
    );

    await act(async () => {
      scheduler.flush();
    });
    expect(save).toHaveBeenCalledTimes(1);

    // An edit arrives while the first save is still running.
    rerender({ revision: 2 });
    scheduler.flush();
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst();
    });

    expect(save).toHaveBeenCalledTimes(2);
  });

  it("reports a failed save and stays dirty", async () => {
    const scheduler = new ManualScheduler();
    const onError = vi.fn();
    const save = vi.fn(async () => {
      throw new Error("disk full");
    });

    const { result } = renderHook(() =>
      useAutoSave({ dirty: true, revision: 1, save, scheduler, delayMs: 1500, onError }),
    );

    await act(async () => {
      scheduler.flush();
    });

    expect(onError).toHaveBeenCalledWith("disk full");
    expect(result.current.saving).toBe(false);
  });
});
