import type { IncomingMessage, ServerResponse } from "node:http";
import { failure } from "../../../server/api-errors";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { createPruneApi } from "../../../server/prune-api";
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

    sendJson(response, {
      status: 200,
      body: await createPruneApi().prune({ root, apply: body.apply === true }),
    });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
