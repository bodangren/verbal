import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeFileSystem } from "@verbal/core";
import { runCommand } from "@verbal/media";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { getJobRegistry } from "../../../server/registry";
import { createStoryboardRenderer } from "../../../server/remotion-renderer";
import { startStoryboardExport } from "../../../server/storyboard-api";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response, "POST");
    return;
  }

  const result = await startStoryboardExport(
    {
      fs: nodeFileSystem,
      registry: await getJobRegistry(),
      renderer: createStoryboardRenderer(),
      run: runCommand,
      now: () => new Date(),
    },
    await readJsonBody(request),
  );

  sendJson(response, result);
}
