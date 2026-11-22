import { describe, expect, it } from "vitest";
import { buildCompositeArgs, CompositeError, type CompositeRequest } from "./composite";

function request(overrides: Partial<CompositeRequest> = {}): CompositeRequest {
  return {
    outputPath: "/out/final.mp4",
    width: 1920,
    height: 1080,
    fps: 30,
    durationSeconds: 10,
    layout: "speaker-inset",
    speaker: { input: "/media/speaker.mp4" },
    slide: { input: "/cache/abc/frame-%04d.png", frameRate: 30 },
    key: {},
    audio: { loudnessLufs: -16 },
    ...overrides,
  };
}

function graphOf(args: string[]): string {
  return args[args.indexOf("-filter_complex") + 1] ?? "";
}

describe("buildCompositeArgs", () => {
  it("composites a full-frame slide without keying the speaker", () => {
    const args = buildCompositeArgs(request({ layout: "full-frame" }));
    const graph = graphOf(args);

    expect(graph).toContain("[0:v]");
    expect(graph).toContain("[vout]");
    expect(graph).not.toContain("chromakey");
    expect(args.at(-1)).toBe("/out/final.mp4");
  });

  it("silences the programme audio for a brand bookend", () => {
    const args = buildCompositeArgs(request({ mute: true, layout: "full-frame" }));
    const graph = graphOf(args);

    expect(graph).toContain("anullsrc=r=48000:cl=mono");
    expect(graph).not.toContain("loudnorm");
    expect(args).toContain("48000");
  });

  it("keys the speaker and overlays it for speaker-inset", () => {
    const graph = graphOf(buildCompositeArgs(request()));

    expect(graph).toContain("chromakey=color=0x00FF00");
    expect(graph).toContain("despill=type=green");
    expect(graph).toContain("overlay=");
    expect(graph).toContain("[vout]");
  });

  it("honours a custom key colour", () => {
    const graph = graphOf(
      buildCompositeArgs(request({ key: { color: "0x0000FF", similarity: 0.2 } })),
    );

    expect(graph).toContain("chromakey=color=0x0000FF");
    expect(graph).toContain("similarity=0.2");
  });

  it("stacks slide and speaker for side-by-side", () => {
    const graph = graphOf(buildCompositeArgs(request({ layout: "side-by-side" })));

    expect(graph).toContain("hstack=inputs=2");
    expect(graph).toContain("chromakey=");
  });

  it("adds a ducked music bed when music is provided", () => {
    const graph = graphOf(
      buildCompositeArgs(
        request({ audio: { musicInput: "/media/music.mp3", musicVolume: 0.25, loudnessLufs: -16 } }),
      ),
    );

    expect(graph).toContain("sidechaincompress");
    expect(graph).toContain("amix=inputs=2");
    expect(graph).toContain("volume=0.25");
    expect(graph).toContain("loudnorm=I=-16");
  });

  it("omits the music chain when there is no music", () => {
    const graph = graphOf(buildCompositeArgs(request()));

    expect(graph).not.toContain("sidechaincompress");
    expect(graph).not.toContain("amix");
    expect(graph).toContain("loudnorm=I=-16");
  });

  it("keeps hostile paths out of the filtergraph", () => {
    const hostile = '/media/"; rm -rf / #.mp4';
    const args = buildCompositeArgs(
      request({
        speaker: { input: hostile },
        slide: { input: hostile, frameRate: 30 },
      }),
    );

    expect(args).toContain(hostile);
    expect(graphOf(args)).not.toContain(hostile);
  });

  it("is deterministic for identical requests", () => {
    expect(buildCompositeArgs(request())).toEqual(buildCompositeArgs(request()));
  });

  it("rejects a non-positive duration", () => {
    expect(() => buildCompositeArgs(request({ durationSeconds: 0 }))).toThrow(CompositeError);
  });

  it("rejects a missing output path", () => {
    expect(() => buildCompositeArgs(request({ outputPath: "" }))).toThrow(CompositeError);
  });

  it("passes the audio target loudness through loudnorm", () => {
    const graph = graphOf(buildCompositeArgs(request({ audio: { loudnessLufs: -23 } })));

    expect(graph).toContain("loudnorm=I=-23");
  });
});
