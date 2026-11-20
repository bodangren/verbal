import type { IncomingMessage, ServerResponse } from "node:http";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { createStoryboardApi } from "../../../server/storyboard-api";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response, "POST");
    return;
  }

  const api = createStoryboardApi();
  sendJson(response, await api.preview(await readJsonBody(request)));
}
