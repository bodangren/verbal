import type { IncomingMessage, ServerResponse } from "node:http";
import { failure } from "../../../server/api-errors";
import { createFsApi } from "../../../server/fs-api";
import { methodNotAllowed, sendJson } from "../../../server/http";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response, "GET");
    return;
  }

  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const requested = url.searchParams.get("path") ?? undefined;
    const includeFiles =
      url.searchParams.get("includeFiles") === "1" ||
      url.searchParams.get("includeFiles") === "true";

    sendJson(response, {
      status: 200,
      body: await createFsApi().listing(requested, { includeFiles }),
    });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
