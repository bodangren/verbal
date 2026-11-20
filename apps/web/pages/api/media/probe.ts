import type { IncomingMessage, ServerResponse } from "node:http";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { createMediaApi } from "../../../server/media-api";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response, "POST");
    return;
  }

  const api = createMediaApi();
  sendJson(response, await api.probe(await readJsonBody(request)));
}
