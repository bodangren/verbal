// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranscript } from "@verbal/core/browser";
import { PlaybackScreen } from "./PlaybackScreen";

const transcript = createTranscript([
  { text: "hello", start: 0, end: 0.4 },
  { text: "world", start: 0.45, end: 0.9 },
  { text: "again", start: 1.8, end: 2.2 },
]);

const play = vi.fn(() => Promise.resolve());
const pause = vi.fn();

beforeEach(() => {
  const times = new WeakMap<HTMLMediaElement, number>();
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return times.get(this) ?? 0;
    },
    set(this: HTMLMediaElement, value: number) {
      times.set(this, value);
    },
  });
  Object.defineProperty(HTMLMediaElement.prototype, "play", {
    configurable: true,
    value: play,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "pause", {
    configurable: true,
    value: pause,
  });
  Object.defineProperty(HTMLMediaElement.prototype, "duration", {
    configurable: true,
    get() {
      return 2;
    },
  });
  play.mockClear();
  pause.mockClear();
});

afterEach(cleanup);

/** Scheduler the test advances by hand. */
class ManualScheduler {
  private callbacks = new Map<number, () => void>();
  private next = 1;

  request(callback: () => void): number {
    const handle = this.next;
    this.next += 1;
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
}

describe("PlaybackScreen", () => {
  it("renders the media and the transcript", () => {
    render(<PlaybackScreen transcript={transcript} mediaUrl="/media/take.mp4" />);

    const video = screen.getByLabelText(/media preview/i);
    expect(video.getAttribute("src")).toBe("/media/take.mp4");
    expect(screen.getByRole("region", { name: /transcript/i })).toBeTruthy();
  });

  it("seeks to a word's start when it is clicked", () => {
    render(<PlaybackScreen transcript={transcript} mediaUrl="/media/take.mp4" />);

    fireEvent.click(screen.getByRole("button", { name: "again" }));

    const video = screen.getByLabelText(/media preview/i) as HTMLVideoElement;
    expect(video.currentTime).toBe(1.8);
  });

  it("starts playback and switches the control to pause", () => {
    render(<PlaybackScreen transcript={transcript} mediaUrl="/media/take.mp4" />);

    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /pause/i })).toBeTruthy();
  });

  it("pauses playback when the control is pressed again", () => {
    render(<PlaybackScreen transcript={transcript} mediaUrl="/media/take.mp4" />);

    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    fireEvent.click(screen.getByRole("button", { name: /pause/i }));

    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /play/i })).toBeTruthy();
  });

  it("labels its transcript so the page can tell it from the editor", () => {
    render(
      <PlaybackScreen
        transcript={transcript}
        mediaUrl="/media/take.mp4"
        transcriptLabel="Playback transcript"
      />,
    );

    expect(screen.getByRole("region", { name: "Playback transcript" })).toBeTruthy();
  });

  it("plays a take before it has a transcript", () => {
    render(<PlaybackScreen transcript={null} mediaUrl="/media/take.mp4" />);

    fireEvent.click(screen.getByRole("button", { name: /play/i }));

    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("region", { name: /transcript/i })).toBeNull();
  });

  it("toggles playback when the video itself is clicked", () => {
    render(<PlaybackScreen transcript={transcript} mediaUrl="/media/take.mp4" />);

    fireEvent.click(screen.getByLabelText(/media preview/i));

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("scrubs to a position from the range control", () => {
    render(<PlaybackScreen transcript={transcript} mediaUrl="/media/take.mp4" />);

    const video = screen.getByLabelText(/media preview/i) as HTMLVideoElement;
    fireEvent.loadedMetadata(video);
    fireEvent.change(screen.getByLabelText("Seek"), { target: { value: "1.5" } });

    expect(video.currentTime).toBe(1.5);
    expect(screen.getByText("0:01 / 0:02")).toBeTruthy();
  });

  it("hides its built-in transcript when the page owns one", () => {
    render(
      <PlaybackScreen transcript={transcript} mediaUrl="/media/take.mp4" showTranscript={false} />,
    );

    expect(screen.queryByRole("region", { name: /transcript/i })).toBeNull();
  });

  it("hands the video element to the caller", () => {
    const onVideoReady = vi.fn();
    render(
      <PlaybackScreen
        transcript={transcript}
        mediaUrl="/media/take.mp4"
        onVideoReady={onVideoReady}
      />,
    );

    expect(onVideoReady).toHaveBeenCalledWith(expect.any(HTMLMediaElement));
  });

  it("reports the active word so an external transcript can highlight it", () => {
    const scheduler = new ManualScheduler();
    const onActiveWordChange = vi.fn();
    render(
      <PlaybackScreen
        transcript={transcript}
        mediaUrl="/media/take.mp4"
        scheduler={scheduler}
        onActiveWordChange={onActiveWordChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    const video = screen.getByLabelText(/media preview/i) as HTMLVideoElement;
    video.currentTime = 0.5;
    act(() => scheduler.flush());

    expect(onActiveWordChange).toHaveBeenCalledWith("w1");
  });

  it("surfaces a media that will not load instead of failing silently", () => {
    render(<PlaybackScreen transcript={transcript} mediaUrl="/api/media/file?root=%2Ftmp%2Fgone" />);

    fireEvent.error(screen.getByLabelText(/media preview/i));

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("could not be loaded");
    expect(alert.textContent).toContain("/api/media/file?root=%2Ftmp%2Fgone");
  });

  it("clears the error when the media loads", () => {
    render(<PlaybackScreen transcript={transcript} mediaUrl="/media/take.mp4" />);

    const video = screen.getByLabelText(/media preview/i);
    fireEvent.error(video);
    expect(screen.getByRole("alert")).toBeTruthy();

    fireEvent.loadedData(video);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
