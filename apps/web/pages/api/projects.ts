import type { IncomingMessage, ServerResponse } from "node:http";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { createProjectApi } from "../../server/project-api";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const api = createProjectApi();
  const method = request.method ?? "GET";

  if (method === "POST") {
    sendJson(response, await api.create(await readJsonBody(request)));
    return;
  }

  if (method === "GET") {
    const url = new URL(request.url ?? "/", "http://localhost");
    sendJson(response, await api.open({ root: url.searchParams.get("root") }));
    return;
  }

  methodNotAllowed(response, "GET, POST");
}
