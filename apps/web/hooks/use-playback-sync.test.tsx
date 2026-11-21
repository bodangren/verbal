// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTranscript } from "@verbal/core/browser";
import {
  useActiveWord,
  type PlaybackScheduler,
} from "./use-playback-sync";

const transcript = createTranscript([
  { text: "hello", start: 0, end: 0.4 },
  { text: "world", start: 0.45, end: 0.9 },
  { text: "again", start: 1.8, end: 2.2 },
]);

/** Scheduler that runs callbacks only when the test asks it to. */
class ManualScheduler implements PlaybackScheduler {
  private callbacks = new Map<number, () => void>();
  private nextHandle = 1;

  request(callback: () => void): number {
    const handle = this.nextHandle;
    this.nextHandle += 1;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.callbacks.delete(handle);
  }

  flush(): void {
    const pending = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of pending) {
      callback();
    }
  }

  get pending(): number {
    return this.callbacks.size;
  }
}

describe("useActiveWord", () => {
  it("starts with no active word", () => {
    const scheduler = new ManualScheduler();
    const { result } = renderHook(() =>
      useActiveWord({
        words: transcript.words,
        getTime: () => 0,
        active: false,
        scheduler,
      }),
    );

    expect(result.current).toBe(-1);
  });

  it("does not schedule work while inactive", () => {
    const scheduler = new ManualScheduler();
    renderHook(() =>
      useActiveWord({
        words: transcript.words,
        getTime: () => 0,
        active: false,
        scheduler,
      }),
    );

    expect(scheduler.pending).toBe(0);
  });

  it("tracks the word at the current playback time", () => {
    const scheduler = new ManualScheduler();
    let time = 0;

    const { result } = renderHook(() =>
      useActiveWord({
        words: transcript.words,
        getTime: () => time,
        active: true,
        scheduler,
      }),
    );

    expect(result.current).toBe(0);

    act(() => {
      time = 1.85;
      scheduler.flush();
    });

    expect(result.current).toBe(2);

    act(() => {
      time = 2.5;
      scheduler.flush();
    });

    expect(result.current).toBe(2);
  });

  it("stops scheduling after unmount", () => {
    const scheduler = new ManualScheduler();
    const { unmount } = renderHook(() =>
      useActiveWord({
        words: transcript.words,
        getTime: () => 0,
        active: true,
        scheduler,
      }),
    );

    expect(scheduler.pending).toBe(1);
    unmount();
    expect(scheduler.pending).toBe(0);
  });
});
