import { spawn } from "node:child_process";
import { promises as nodeFs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeFileSystem } from "@verbal/core";
import { startCapture } from "../../server/capture-api";
import { runCaptureJob, type CaptureSpawner } from "../../server/capture-job";
import { clearCapture, registerCapture } from "../../server/capture-registry";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { getJobRegistry } from "../../server/registry";

const spawnCapture: CaptureSpawner = (file, args, options) =>
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

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response, "POST");
    return;
  }

  const registry = await getJobRegistry();

  const result = await startCapture(
    {
      fs: nodeFileSystem,
      registry,
      now: () => new Date(),
      runCapture: async (jobId, captureRequest) => {
        const controller = registerCapture(jobId);
        try {
          await runCaptureJob(
            {
              registry,
              spawn: spawnCapture,
              unlink: (path) => nodeFs.unlink(path),
              signal: controller.signal,
            },
            { jobId, request: captureRequest },
          );
        } finally {
          clearCapture(jobId);
        }
      },
    },
    await readJsonBody(request),
  );

  sendJson(response, result);
}
