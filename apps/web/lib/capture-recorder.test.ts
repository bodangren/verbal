import { describe, expect, it } from "vitest";
import {
  CaptureRecorder,
  MIME_CANDIDATES,
  pickMimeType,
  type MediaRecorderLike,
} from "./capture-recorder";

class FakeRecorder implements MediaRecorderLike {
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["one"]) });
    this.ondataavailable?.({ data: new Blob(["two"]) });
    this.onstop?.();
  }
}

function fakeStream(): MediaStream {
  return {} as MediaStream;
}

describe("pickMimeType", () => {
  it("prefers vp9, then vp8, then webm, then mp4", () => {
    expect(pickMimeType((type) => type.includes("vp9"))).toBe(MIME_CANDIDATES[0]);
    expect(pickMimeType((type) => type.includes("vp8"))).toBe(MIME_CANDIDATES[1]);
    expect(pickMimeType(() => true)).toBe(MIME_CANDIDATES[0]);
    expect(pickMimeType(() => false)).toBeNull();
  });
});

describe("CaptureRecorder", () => {
  it("collects chunks and returns one blob on stop", async () => {
    const recorder = new CaptureRecorder();
    const fake = new FakeRecorder();

    const type = recorder.start(fakeStream(), () => fake, () => true);
    expect(type).toBe(MIME_CANDIDATES[0]);
    expect(recorder.active).toBe(true);

    const blob = await recorder.stop();

    expect(blob.size).toBeGreaterThan(0);
    expect(blob.type).toBe(MIME_CANDIDATES[0]);
    expect(recorder.active).toBe(false);
  });

  it("returns an empty blob when stopped without starting", async () => {
    const recorder = new CaptureRecorder();
    const blob = await recorder.stop();
    expect(blob.size).toBe(0);
  });

  it("refuses to start when no format is supported", () => {
    const recorder = new CaptureRecorder();
    expect(() =>
      recorder.start(fakeStream(), () => new FakeRecorder(), () => false),
    ).toThrow(/format/);
  });

  it("refuses a second start", () => {
    const recorder = new CaptureRecorder();
    recorder.start(fakeStream(), () => new FakeRecorder(), () => true);
    expect(() =>
      recorder.start(fakeStream(), () => new FakeRecorder(), () => true),
    ).toThrow(/already started/);
  });
});
