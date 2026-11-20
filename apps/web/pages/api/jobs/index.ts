import type { IncomingMessage, ServerResponse } from "node:http";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { createJobApi } from "../../../server/jobs-api";
import { getJobRegistry } from "../../../server/registry";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const api = createJobApi(await getJobRegistry());
  const method = request.method ?? "GET";

  if (method === "GET") {
    sendJson(response, api.list());
    return;
  }

  if (method === "POST") {
    sendJson(response, await api.create(await readJsonBody(request)));
    return;
  }

  methodNotAllowed(response, "GET, POST");
}
