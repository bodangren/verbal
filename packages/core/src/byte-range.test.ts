import { describe, expect, it } from "vitest";
import { parseByteRange } from "./byte-range";

const SIZE = 1000;

describe("parseByteRange", () => {
  it("ignores a missing header so the whole file is served", () => {
    expect(parseByteRange(null, SIZE)).toBeNull();
  });

  it("treats a non-bytes unit as malformed", () => {
    expect(parseByteRange("items=0-10", SIZE)).toBeNull();
  });

  it("parses a closed range", () => {
    expect(parseByteRange("bytes=100-199", SIZE)).toEqual({ start: 100, end: 199 });
  });

  it("runs an open-ended range to the last byte", () => {
    expect(parseByteRange("bytes=500-", SIZE)).toEqual({ start: 500, end: 999 });
  });

  it("clamps a closed range past the end of file", () => {
    expect(parseByteRange("bytes=900-5000", SIZE)).toEqual({ start: 900, end: 999 });
  });

  it("returns the tail for a suffix range", () => {
    expect(parseByteRange("bytes=-200", SIZE)).toEqual({ start: 800, end: 999 });
  });

  it("clamps a suffix range longer than the file", () => {
    expect(parseByteRange("bytes=-5000", SIZE)).toEqual({ start: 0, end: 999 });
  });

  it("reports a range starting past the end as unsatisfiable", () => {
    expect(parseByteRange("bytes=1000-", SIZE)).toBe("unsatisfiable");
    expect(parseByteRange("bytes=2000-3000", SIZE)).toBe("unsatisfiable");
  });

  it("reports every range against an empty file as unsatisfiable", () => {
    expect(parseByteRange("bytes=0-", 0)).toBe("unsatisfiable");
  });

  it("treats malformed ranges as absent rather than failing the request", () => {
    expect(parseByteRange("bytes=abc", SIZE)).toBeNull();
    expect(parseByteRange("bytes=10-5", SIZE)).toBeNull();
    expect(parseByteRange("bytes=", SIZE)).toBeNull();
    expect(parseByteRange("bytes=1.5-2", SIZE)).toBeNull();
  });

  it("serves the whole file when several ranges are requested", () => {
    expect(parseByteRange("bytes=0-10,20-30", SIZE)).toBeNull();
  });
});
