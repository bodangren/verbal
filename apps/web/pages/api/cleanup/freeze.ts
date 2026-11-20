import type { IncomingMessage, ServerResponse } from "node:http";
import { failure } from "../../../server/api-errors";
import { createFreezeApi } from "../../../server/freeze-api";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { asRecord, requireAbsolutePath } from "../../../server/validation";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response, "POST");
    return;
  }

  try {
    const body = asRecord(await readJsonBody(request));
    const root = requireAbsolutePath(body.root, "root");

    sendJson(response, { status: 200, body: await createFreezeApi().freeze(root) });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
