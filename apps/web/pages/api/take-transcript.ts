import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeFileSystem } from "@verbal/core";
import { failure } from "../../server/api-errors";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { getJobRegistry } from "../../server/registry";
import { normalizeTakeId } from "../../server/take-api";
import { readTakeTranscript, saveTakeTranscript } from "../../server/take-transcript";
import { takeMediaPath } from "../../server/take-store";
import { runTranscriptionJob } from "../../server/transcribe-job";
import { createTranscribeService } from "../../server/transcribe-service";
import { asRecord, requireAbsolutePath } from "../../server/validation";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";

  try {
    const url = new URL(request.url ?? "/", "http://localhost");

    if (method === "GET") {
      const root = requireAbsolutePath(url.searchParams.get("root"), "root");
      const takeId = normalizeTakeId(url.searchParams.get("takeId"));
      const transcript = await readTakeTranscript(nodeFileSystem, root, takeId);
      if (transcript === null) {
        sendJson(response, { status: 404, body: { error: "no transcript" } });
        return;
      }
      sendJson(response, { status: 200, body: transcript });
      return;
    }

    if (method === "POST") {
      const body = asRecord(await readJsonBody(request));
      const root = requireAbsolutePath(body.root, "root");
      const takeId = normalizeTakeId(body.takeId);

      const registry = await getJobRegistry();
      const service = createTranscribeService();
      const provider = service.provider();
      const job = await registry.create("transcribe");

      void runTranscriptionJob({
        registry,
        jobId: job.id,
        provider,
        request: { filePath: takeMediaPath(root, takeId) },
        onTranscript: (result) =>
          saveTakeTranscript(nodeFileSystem, root, takeId, result.words),
      });

      sendJson(response, { status: 202, body: job });
      return;
    }

    methodNotAllowed(response, "GET, POST");
  } catch (error) {
    sendJson(response, failure(error));
  }
}
