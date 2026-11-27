import { promises as nodeFs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { failure } from "../../server/api-errors";
import { spawnCapture } from "../../server/capture-spawn";
import { methodNotAllowed, PayloadTooLargeError, readJsonBody, sendJson } from "../../server/http";
import { runNormalizeJob } from "../../server/normalize-job";
import { getJobRegistry } from "../../server/registry";
import { createTakeApi, MAX_UPLOAD_BODY_BYTES } from "../../server/take-api";
import { asRecord } from "../../server/validation";

export const config = {
  api: { bodyParser: { sizeLimit: MAX_UPLOAD_BODY_BYTES } },
};

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  try {
    const registry = await getJobRegistry();
    const api = createTakeApi({
      registry,
      runNormalize: (input) =>
        runNormalizeJob(
          {
            registry,
            spawn: spawnCapture,
            unlink: (path) => nodeFs.unlink(path),
          },
          input,
        ),
    });

    if (method === "GET") {
      sendJson(response, await api.list({ root: url.searchParams.get("root") }));
      return;
    }

    if (method === "POST") {
      // vinext parses JSON bodies safely; a binary body arrives as a string and
      // corrupts the WebM. Base64 keeps the bytes intact.
      const body = asRecord(await readJsonBody(request, MAX_UPLOAD_BODY_BYTES));
      const dataBase64 = body.dataBase64;
      if (typeof dataBase64 !== "string") {
        sendJson(response, { status: 400, body: { error: "dataBase64 is required" } });
        return;
      }

      sendJson(
        response,
        await api.upload({
          root: body.root,
          takeId: body.takeId,
          durationSeconds: body.durationSeconds,
          dataBase64,
        }),
      );
      return;
    }

    methodNotAllowed(response, "GET, POST");
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      response.setHeader("Connection", "close");
      sendJson(response, { status: 413, body: { error: error.message } });
      return;
    }
    sendJson(response, failure(error));
  }
}
