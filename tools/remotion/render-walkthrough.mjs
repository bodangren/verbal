import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";

const here = path.dirname(fileURLToPath(import.meta.url));
const BROWSER = process.env.VERBAL_CHROME ?? "/usr/bin/google-chrome";
const output = process.argv[2] ?? path.join(here, "out", "walkthrough.mp4");

console.log("bundling…");
const serveUrl = await bundle({
  entryPoint: path.join(here, "src", "walkthrough", "index.ts"),
  // The disk here is nearly full; a pack cache is a luxury we cannot afford.
  enableCaching: false,
  onProgress: (percent) => {
    if (percent % 25 === 0) console.log(`  bundle ${percent}%`);
  },
});

console.log("selecting composition…");
const composition = await selectComposition({
  serveUrl,
  id: "Walkthrough",
  browserExecutable: BROWSER,
});
console.log(`  ${composition.width}x${composition.height} @ ${composition.fps}fps, ${composition.durationInFrames} frames`);

let lastLogged = -1;
await renderMedia({
  composition,
  serveUrl,
  codec: "h264",
  outputLocation: output,
  browserExecutable: BROWSER,
  chromiumOptions: { gl: "swangle" },
  concurrency: 4,
  crf: 24,
  onProgress: ({ progress }) => {
    const percent = Math.floor(progress * 100);
    if (percent !== lastLogged && percent % 10 === 0) {
      lastLogged = percent;
      console.log(`  render ${percent}%`);
    }
  },
});

console.log("wrote", output);
