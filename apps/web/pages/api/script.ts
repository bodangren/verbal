import type { IncomingMessage, ServerResponse } from "node:http";
import { failure } from "../../server/api-errors";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { createScriptApi } from "../../server/script-api";
import { requireAbsolutePath } from "../../server/validation";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const api = createScriptApi();

  try {
    if (method === "GET") {
      const url = new URL(request.url ?? "/", "http://localhost");
      const root = requireAbsolutePath(url.searchParams.get("root"), "root");
      sendJson(response, { status: 200, body: { script: await api.read(root) } });
      return;
    }

    if (method === "PUT") {
      const script = await api.write(await readJsonBody(request));
      sendJson(response, { status: 200, body: { script } });
      return;
    }

    methodNotAllowed(response, "GET, PUT");
  } catch (error) {
    sendJson(response, failure(error));
  }
}
