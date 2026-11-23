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

  it("keeps a fallback message actionable and the raw detail", () => {
    const copy = errorCopyFor(new Error("boom"));

    expect(copy.message).toMatch(/Try again/);
    expect(copy.detail).toBe("boom");
  });
});
