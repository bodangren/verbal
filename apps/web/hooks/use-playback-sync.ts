import { useEffect, useRef, useState } from "react";
import { wordIndexAtTime, type TranscriptWord } from "@verbal/core";

/** Scheduling seam, so tests can drive the polling loop deterministically. */
export type PlaybackScheduler = {
  request(callback: () => void): number;
  cancel(handle: number): void;
};

/** Default scheduler: one poll per animation frame. */
export const animationFrameScheduler: PlaybackScheduler = {
  request(callback: () => void): number {
    return requestAnimationFrame(() => {
      callback();
    });
  },

  cancel(handle: number): void {
    cancelAnimationFrame(handle);
  },
};

export type UseActiveWordOptions = {
  words: readonly TranscriptWord[];
  /** Reads the player's current position, in seconds. */
  getTime: () => number;
  /** Polling runs only while this is true (i.e. while playing). */
  active: boolean;
  scheduler?: PlaybackScheduler;
};

/**
 * Returns the index of the word being spoken, updated once per frame.
 *
 * The hook reads through a ref so an inline `getTime` callback does not
 * restart the loop on every render, and it only calls `setState` when the
 * active word actually changes — a highlight tick must not re-render the
 * transcript on every frame.
 */
export function useActiveWord({
  words,
  getTime,
  active,
  scheduler = animationFrameScheduler,
}: UseActiveWordOptions): number {
  const [index, setIndex] = useState(-1);
  const getTimeRef = useRef(getTime);

  useEffect(() => {
    getTimeRef.current = getTime;
  });

  useEffect(() => {
    if (!active) {
      return;
    }

    const read = () => wordIndexAtTime(words, getTimeRef.current());

    setIndex(read());

    let handle = 0;
    const tick = () => {
      const next = read();
      setIndex((current) => (current === next ? current : next));
      handle = scheduler.request(tick);
    };

    handle = scheduler.request(tick);

    return () => {
      scheduler.cancel(handle);
    };
  }, [words, active, scheduler]);

  return index;
}
