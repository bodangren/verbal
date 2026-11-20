// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranscript } from "@verbal/core";
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
  play.mockClear();
  pause.mockClear();
});

afterEach(cleanup);

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
