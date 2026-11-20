import { describe, expect, it } from "vitest";
import { assessKeyQuality } from "./key-quality";

const green = { r: 20, g: 200, b: 30 };
const gray = { r: 120, g: 120, b: 120 };

describe("assessKeyQuality", () => {
  it("accepts a uniform green background", () => {
    const quality = assessKeyQuality(Array.from({ length: 20 }, () => green));

    expect(quality.level).toBe("good");
    expect(quality.message).toMatch(/clean/i);
  });

  it("rejects a background that is not green", () => {
    const quality = assessKeyQuality(Array.from({ length: 20 }, () => gray));

    expect(quality.level).toBe("poor");
    expect(quality.message).toMatch(/green/i);
  });

  it("warns about uneven lighting", () => {
    const samples = [
      ...Array.from({ length: 10 }, () => green),
      ...Array.from({ length: 10 }, () => gray),
    ];

    const quality = assessKeyQuality(samples);

    expect(quality.level).toBe("warning");
    expect(quality.message).toMatch(/uneven|spill/i);
  });

  it("reports poor quality when there are no samples", () => {
    expect(assessKeyQuality([]).level).toBe("poor");
  });
});
