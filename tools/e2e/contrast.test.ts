import { describe, expect, it } from "vitest";
import { contrastRatio, meetsAA } from "./contrast";

describe("contrastRatio", () => {
  it("marks DESIGN.md tertiary text on card as a fail", () => {
    const ratio = contrastRatio("#707070", "#252525");

    expect(ratio).toBeCloseTo(3.1, 1);
    expect(ratio).toBeLessThan(4.5);
    expect(meetsAA("#707070", "#252525")).toBe(false);
  });

  it("passes secondary text on card", () => {
    const ratio = contrastRatio("#a0a0a0", "#252525");

    expect(ratio).toBeCloseTo(5.86, 1);
    expect(meetsAA("#a0a0a0", "#252525")).toBe(true);
  });

  it("accepts short hex and rejects nonsense", () => {
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 1);
    expect(() => contrastRatio("not-a-colour", "#000000")).toThrow(/colour/i);
  });
});
