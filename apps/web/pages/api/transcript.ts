import type { IncomingMessage, ServerResponse } from "node:http";
import {
  nodeFileSystem,
  parseTranscript,
  projectPaths,
  saveTranscript,
  validateTranscript,
} from "@verbal/core";
import { failure } from "../../server/api-errors";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { asRecord, requireAbsolutePath } from "../../server/validation";

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";

  try {
    if (method === "GET") {
      const url = new URL(request.url ?? "/", "http://localhost");
      const root = requireAbsolutePath(url.searchParams.get("root"), "root");

      try {
        const transcript = parseTranscript(
          await nodeFileSystem.readFile(projectPaths(root).transcript),
        );
        sendJson(response, { status: 200, body: transcript });
      } catch (error) {
        if (isNotFound(error)) {
          sendJson(response, { status: 404, body: { error: "no transcript" } });
          return;
        }
        throw error;
      }
      return;
    }

    if (method === "PUT") {
      const body = asRecord(await readJsonBody(request));
      const root = requireAbsolutePath(body.root, "root");
      const transcript = validateTranscript(body.document);

      await saveTranscript(
        nodeFileSystem,
        projectPaths(root).transcript,
        transcript,
      );

      sendJson(response, { status: 200, body: transcript });
      return;
    }

    methodNotAllowed(response, "GET, PUT");
  } catch (error) {
    sendJson(response, failure(error));
  }
}
