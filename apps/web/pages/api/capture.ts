import { promises as nodeFs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeFileSystem } from "@verbal/core";
import { startCapture } from "../../server/capture-api";
import { runCaptureJob } from "../../server/capture-job";
import { spawnCapture } from "../../server/capture-spawn";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { getJobRegistry } from "../../server/registry";

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
      runCapture: async (_jobId, input) => {
        await runCaptureJob(
          {
            registry,
            spawn: spawnCapture,
            unlink: (path) => nodeFs.unlink(path),
          },
          input,
        );
      },
    },
    await readJsonBody(request),
  );

  sendJson(response, result);
}
