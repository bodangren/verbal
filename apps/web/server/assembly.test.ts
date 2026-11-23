import { describe, expect, it } from "vitest";
import { buildTakeEdl, edlDuration } from "./assembly";

const script = "Hello world. This is a test.";
const words = [
  { text: "hello", start: 0, end: 0.5 },
  { text: "world", start: 0.5, end: 1 },
  { text: "this", start: 1.5, end: 2 },
  { text: "is", start: 2, end: 2.5 },
  { text: "a", start: 2.5, end: 2.8 },
  { text: "test", start: 2.8, end: 3.2 },
];

describe("buildTakeEdl", () => {
  it("keeps the spoken beats with handles", () => {
    const edl = buildTakeEdl(script, { words }, "take-1", 3.2);

    expect(edl.ranges).toEqual([
      { takeId: "take-1", startSeconds: 0, endSeconds: 1.1 },
      { takeId: "take-1", startSeconds: 1.4, endSeconds: 3.2 },
    ]);
    expect(edlDuration(edl.ranges)).toBeCloseTo(2.9);
  });

  it("drops a bungled beat from the cut", () => {
    const bungled = words.filter((word) => word.text !== "test");
    const edl = buildTakeEdl(script, { words: bungled }, "take-1", 3.2);

    expect(edl.ranges).toEqual([
      { takeId: "take-1", startSeconds: 0, endSeconds: 1.1 },
    ]);
  });

  it("returns an empty cut when nothing matched", () => {
    const edl = buildTakeEdl(script, { words: [] }, "take-1", 0);
    expect(edl.ranges).toEqual([]);
    expect(edlDuration(edl.ranges)).toBe(0);
  });
});
