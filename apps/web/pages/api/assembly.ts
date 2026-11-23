import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeFileSystem } from "@verbal/core";
import { failure } from "../../server/api-errors";
import { buildTakeEdl, edlDuration } from "../../server/assembly";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { createScriptApi } from "../../server/script-api";
import { normalizeTakeId } from "../../server/take-api";
import { readTakeTranscript } from "../../server/take-transcript";
import { asRecord, requireAbsolutePath } from "../../server/validation";

/**
 * Builds the edit decision list for one take.
 *
 * This is the cut plan; rendering the EDL to a file is the export step. The
 * response is small, so the review UI can show the kept ranges immediately.
 */
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
    const takeId = normalizeTakeId(body.takeId);
    const script = await createScriptApi().read(root);
    const transcript = await readTakeTranscript(nodeFileSystem, root, takeId);

    if (transcript === null) {
      sendJson(response, {
        status: 404,
        body: { error: "that take has no transcript yet" },
      });
      return;
    }

    const durationSeconds = transcript.words.reduce(
      (max, word) => Math.max(max, word.end),
      0,
    );
    const edl = buildTakeEdl(script, transcript, takeId, durationSeconds);

    sendJson(response, {
      status: 200,
      body: { ranges: edl.ranges, durationSeconds: edlDuration(edl.ranges) },
    });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
