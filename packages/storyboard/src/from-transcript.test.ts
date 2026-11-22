import { describe, expect, it } from "vitest";
import { storyboardFromTranscript } from "./from-transcript";

const words = ["w0", "w1", "w2", "w3", "w4"].map((id) => ({ id }));

describe("storyboardFromTranscript", () => {
  it("makes one scene per segment, anchored to its first and last word", () => {
    const document = storyboardFromTranscript({
      words,
      segments: [
        { id: "s0", wordIds: ["w0", "w1"] },
        { id: "s1", wordIds: ["w2", "w3", "w4"] },
      ],
    });

    expect(document.schemaVersion).toBe(1);
    expect(document.scenes).toHaveLength(2);
    expect(document.scenes[0]).toMatchObject({
      id: "scene-1",
      anchor: { startWordId: "w0", endWordId: "w1" },
      visual: "talk",
      layer: "full-frame",
    });
    expect(document.scenes[1]).toMatchObject({
      id: "scene-2",
      anchor: { startWordId: "w2", endWordId: "w4" },
    });
  });

  it("skips removed words and drops a segment that becomes empty", () => {
    const document = storyboardFromTranscript({
      words,
      segments: [
        { id: "s0", wordIds: ["w0", "w1"] },
        { id: "s1", wordIds: ["w2"] },
        { id: "s2", wordIds: ["w3", "w4"] },
      ],
      removedWordIds: ["w2"],
    });

    expect(document.scenes).toHaveLength(2);
    expect(document.scenes[0]?.anchor).toEqual({ startWordId: "w0", endWordId: "w1" });
    expect(document.scenes[1]?.anchor).toEqual({ startWordId: "w3", endWordId: "w4" });
  });

  it("falls back to one scene when the transcript has no segments", () => {
    const document = storyboardFromTranscript({ words, segments: [] });

    expect(document.scenes).toHaveLength(1);
    expect(document.scenes[0]?.anchor).toEqual({ startWordId: "w0", endWordId: "w4" });
  });

  it("returns no scenes for an empty transcript", () => {
    expect(storyboardFromTranscript({ words: [], segments: [] }).scenes).toEqual([]);
  });

  it("honours the visual and layer options", () => {
    const document = storyboardFromTranscript(
      { words, segments: [{ id: "s0", wordIds: ["w0"] }] },
      { visual: "slide", layer: "speaker-inset" },
    );

    expect(document.scenes[0]).toMatchObject({ visual: "slide", layer: "speaker-inset" });
  });
});
