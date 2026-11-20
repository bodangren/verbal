import type { IncomingMessage, ServerResponse } from "node:http";
import { failure } from "../../../server/api-errors";
import { methodNotAllowed, sendJson } from "../../../server/http";
import { createMediaFileApi } from "../../../server/media-file";
import { requireAbsolutePath } from "../../../server/validation";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";

  if (method !== "GET" && method !== "HEAD") {
    methodNotAllowed(response, "GET, HEAD");
    return;
  }

  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const root = requireAbsolutePath(url.searchParams.get("root"), "root");

    const api = createMediaFileApi();
    await api.send(request, response, await api.resolve(root));
  } catch (error) {
    sendJson(response, failure(error));
  }
}
