import type { IncomingMessage, ServerResponse } from "node:http";
import { failure } from "../../server/api-errors";
import { createCleanupApi } from "../../server/cleanup-api";
import { methodNotAllowed, sendJson } from "../../server/http";
import { requireAbsolutePath } from "../../server/validation";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";

  if (method !== "GET") {
    methodNotAllowed(response, "GET");
    return;
  }

  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const root = requireAbsolutePath(url.searchParams.get("root"), "root");

    sendJson(response, { status: 200, body: await createCleanupApi().proposals(root) });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
