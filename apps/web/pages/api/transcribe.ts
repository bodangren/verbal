import type { IncomingMessage, ServerResponse } from "node:http";
import { failure } from "../../server/api-errors";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { createTranscribeService } from "../../server/transcribe-service";
import { asRecord, requireAbsolutePath } from "../../server/validation";

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
    const projectRoot = requireAbsolutePath(body.projectRoot, "projectRoot");

    sendJson(response, {
      status: 202,
      body: await createTranscribeService().start(projectRoot),
    });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
