import { describe, expect, it } from "vitest";
import { errorCopyFor } from "./error-copy";

describe("errorCopyFor", () => {
  it("turns a missing folder into a message with a next step", () => {
    const copy = errorCopyFor(new Error("no folder at /tmp/gone"));

    expect(copy.message).toMatch(/Home or Up/);
    expect(copy.detail).toContain("no folder");
  });

  it("turns a media-less project into a next step", () => {
    expect(errorCopyFor(new Error("project has no media")).message).toMatch(
      /Import a take in Ingest/,
    );
  });

  it("turns an existing project into a next step", () => {
    expect(errorCopyFor(new Error("already exists at /x")).message).toMatch(
      /another name/,
    );
  });

  it("explains a missing Remotion package", () => {
    const raw =
      "Cannot find package '@remotion/bundler' imported from /x/tools/remotion/render.mjs";
    const copy = errorCopyFor(new Error(raw));

    expect(copy.message).toBe(
      "The slide renderer is not installed. Run npm install in tools/remotion, then export again.",
    );
    expect(copy.detail).toBe(raw);
  });

  it("explains a missing Remotion module in either order", () => {
    const raw =
      "Error in tools/remotion/render.mjs: Cannot find module '@remotion/bundler'";
    const copy = errorCopyFor(new Error(raw));

    expect(copy.message).toBe(
      "The slide renderer is not installed. Run npm install in tools/remotion, then export again.",
    );
    expect(copy.detail).toBe(raw);
  });

  it("explains a missing speech engine", () => {
    const raw = "no speech engine is set up: install whisper-cli and a model in /data/verbal";
    const copy = errorCopyFor(new Error(raw));

    expect(copy.message).toBe(
      "No speech engine is set up. Install whisper (see README, Transcription setup) or set OPENAI_API_KEY, then try again.",
    );
    expect(copy.detail).toBe(raw);
  });

  it("explains a missing API key without raw provider text", () => {
    const copy = errorCopyFor(new Error("OPENAI_API_KEY is not set"));

    expect(copy.message).toBe(
      "No speech engine is set up. Install whisper (see README, Transcription setup) or set OPENAI_API_KEY, then try again.",
    );
    expect(copy.detail).toBe("OPENAI_API_KEY is not set");
  });

  it("keeps a fallback message actionable and the raw detail", () => {
    const copy = errorCopyFor(new Error("boom"));

    expect(copy.message).toMatch(/Try again/);
    expect(copy.detail).toBe("boom");
  });

  it("keeps an unrelated error on the fallback", () => {
    expect(errorCopyFor(new Error("disk full")).message).toBe(
      "Something went wrong. Try again, or check the server log.",
    );
  });
});
