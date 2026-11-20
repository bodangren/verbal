import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.join(here, "out", "smoke");

const request = {
  template: "title",
  props: { title: "Verbal", subtitle: "storyboard smoke test" },
  durationSeconds: 1,
  fps: 10,
  width: 320,
  height: 180,
  outputDirectory,
};

const child = spawn(process.execPath, [path.join(here, "render.mjs")], {
  stdio: ["pipe", "pipe", "inherit"],
});

let stdout = "";

child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});

child.on("close", (code) => {
  if (code !== 0) {
    process.exit(code ?? 1);
  }
  process.stdout.write(`manifest: ${stdout}\n`);
  process.stdout.write(`frames: ${outputDirectory}\n`);
});

child.stdin.end(JSON.stringify(request));
