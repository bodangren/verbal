import { describe, expect, it } from "vitest";
import { fractionFromClick, timeFromClick } from "./waveform-seek";

describe("timeFromClick", () => {
  it("maps the left edge to zero and the right edge to the duration", () => {
    expect(timeFromClick({ clientX: 100, left: 100, width: 200, durationSeconds: 40 })).toBe(0);
    expect(timeFromClick({ clientX: 300, left: 100, width: 200, durationSeconds: 40 })).toBe(40);
  });

  it("maps the middle to half the duration", () => {
    expect(timeFromClick({ clientX: 200, left: 100, width: 200, durationSeconds: 40 })).toBe(20);
  });

  it("clamps a click outside the element", () => {
    expect(timeFromClick({ clientX: 50, left: 100, width: 200, durationSeconds: 40 })).toBe(0);
    expect(timeFromClick({ clientX: 400, left: 100, width: 200, durationSeconds: 40 })).toBe(40);
  });

  it("reports zero when the geometry or duration is unusable", () => {
    expect(timeFromClick({ clientX: 150, left: 100, width: 0, durationSeconds: 40 })).toBe(0);
    expect(timeFromClick({ clientX: 150, left: 100, width: 200, durationSeconds: 0 })).toBe(0);
    expect(
      timeFromClick({ clientX: 150, left: 100, width: 200, durationSeconds: Number.NaN }),
    ).toBe(0);
  });
});

describe("fractionFromClick", () => {
  it("reports a 0..1 position clamped to the element", () => {
    expect(fractionFromClick({ clientX: 100, left: 100, width: 200 })).toBe(0);
    expect(fractionFromClick({ clientX: 200, left: 100, width: 200 })).toBe(0.5);
    expect(fractionFromClick({ clientX: 999, left: 100, width: 200 })).toBe(1);
    expect(fractionFromClick({ clientX: 0, left: 100, width: 0 })).toBe(0);
  });
});
