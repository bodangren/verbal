import type { IncomingMessage, ServerResponse } from "node:http";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { createStoryboardApi } from "../../../server/storyboard-api";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const api = createStoryboardApi();
  const method = request.method ?? "GET";

  if (method === "GET") {
    const url = new URL(request.url ?? "/", "http://localhost");
    sendJson(response, await api.load({ root: url.searchParams.get("root") }));
    return;
  }

  if (method === "PUT") {
    sendJson(response, await api.save(await readJsonBody(request)));
    return;
  }

  methodNotAllowed(response, "GET, PUT");
}
