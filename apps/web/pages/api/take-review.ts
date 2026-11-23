import type { IncomingMessage, ServerResponse } from "node:http";
import { createChatProvider } from "@verbal/ai";
import { nodeFileSystem } from "@verbal/core";
import { failure } from "../../server/api-errors";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { createScriptApi } from "../../server/script-api";
import { createTakeReviewApi } from "../../server/take-review-api";
import { readTakeTranscript } from "../../server/take-transcript";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";

  try {
    const api = createTakeReviewApi({
      readScript: (root) => createScriptApi().read(root),
      readTranscript: (root, takeId) =>
        readTakeTranscript(nodeFileSystem, root, takeId),
      llm: () =>
        createChatProvider({
          apiKey: process.env.OPENAI_API_KEY ?? "",
          baseUrl: process.env.OPENAI_BASE_URL,
          model: process.env.VERBAL_LLM_MODEL,
        }),
    });

    if (method === "GET") {
      const url = new URL(request.url ?? "/", "http://localhost");
      sendJson(
        response,
        await api.preview({
          root: url.searchParams.get("root"),
          takeId: url.searchParams.get("takeId"),
        }),
      );
      return;
    }

    if (method === "POST") {
      sendJson(response, await api.review(await readJsonBody(request)));
      return;
    }

    methodNotAllowed(response, "GET, POST");
  } catch (error) {
    sendJson(response, failure(error));
  }
}
