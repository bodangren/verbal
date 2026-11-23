import { spawn } from "node:child_process";
import type { CaptureSpawner } from "./capture-job";

/**
 * Runs an FFmpeg child with an argv array and forwards stdout progress.
 *
 * The abort signal kills the child, so a cancelled job stops actual work.
 * stderr is kept for the failure message.
 */
export const spawnCapture: CaptureSpawner = (file, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, [...args], { stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";

    const onAbort = () => {
      child.kill("SIGKILL");
    };

    if (options.signal.aborted) {
      onAbort();
    } else {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    child.stdout.on("data", (chunk: Buffer) => {
      options.onStdout(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      options.signal.removeEventListener("abort", onAbort);
      reject(error);
    });

    child.on("close", (code) => {
      options.signal.removeEventListener("abort", onAbort);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exited with code ${String(code)}: ${stderr.trim()}`));
    });
  });
