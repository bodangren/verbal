import { describe, expect, it } from "vitest";
import type { SlideRenderRequest } from "./types";
import { createProcessRenderer, nodeProcessRunner } from "./worker";

const REQUEST: SlideRenderRequest = {
  sceneId: "s1",
  template: "title",
  props: { title: "Hello" },
  durationSeconds: 1,
  fps: 10,
  width: 320,
  height: 180,
};

/** A tiny Node program that answers like the Remotion renderer. */
const ECHO_SCRIPT = `
let body = "";
process.stdin.on("data", (chunk) => { body += chunk; });
process.stdin.on("end", () => {
  const request = JSON.parse(body);
  process.stdout.write(JSON.stringify({
    frames: Math.round(request.durationSeconds * request.fps),
    fps: request.fps,
    width: request.width,
    height: request.height,
    hasAlpha: true,
    pattern: "element-%01d.png"
  }));
});
`;

describe("nodeProcessRunner", () => {
  it("runs a real child process and returns its manifest", async () => {
    const renderer = createProcessRenderer({
      command: process.execPath,
      args: ["-e", ECHO_SCRIPT],
      run: nodeProcessRunner,
    });

    const manifest = await renderer.render(REQUEST, { outputDirectory: "/tmp/verbal-test" });

    expect(manifest).toEqual({
      frames: 10,
      fps: 10,
      width: 320,
      height: 180,
      hasAlpha: true,
      pattern: "element-%01d.png",
    });
  });

  it("surfaces a non-zero exit with its stderr", async () => {
    const renderer = createProcessRenderer({
      command: process.execPath,
      args: ["-e", 'process.stderr.write("boom"); process.exit(2);'],
      run: nodeProcessRunner,
    });

    await expect(
      renderer.render(REQUEST, { outputDirectory: "/tmp/verbal-test" }),
    ).rejects.toMatchObject({ code: "render-failed" });
  });
});
