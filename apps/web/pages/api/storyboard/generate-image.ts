import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createOpenAiImageProvider } from "@verbal/ai";
import { createFileAssetStore, nodeAssetFileSystem } from "@verbal/compose";
import { nodeFileSystem } from "@verbal/core";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { generateSceneImage } from "../../../server/image-api";
import { asRecord, requireAbsolutePath } from "../../../server/validation";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "POST") {
    methodNotAllowed(response, "POST");
    return;
  }

  const body = asRecord(await readJsonBody(request));
  const apiKey = process.env.OPENAI_API_KEY ?? "";

  // A dry run only needs the configured price, which is local.
  if (body.dryRun !== true && apiKey.trim() === "") {
    sendJson(response, { status: 503, body: { error: "OPENAI_API_KEY is not set" } });
    return;
  }

  let root: string;
  try {
    root = requireAbsolutePath(body.root, "root");
  } catch (error) {
    sendJson(response, {
      status: 400,
      body: { error: error instanceof Error ? error.message : String(error) },
    });
    return;
  }

  const baseUrl = process.env.OPENAI_BASE_URL;
  const provider = createOpenAiImageProvider({
    apiKey: apiKey === "" ? "unused-for-estimate" : apiKey,
    ...(baseUrl === undefined ? {} : { baseUrl }),
  });

  const result = await generateSceneImage(
    {
      fs: nodeFileSystem,
      assets: createFileAssetStore(
        nodeAssetFileSystem,
        path.join(root, "assets", "generated"),
      ),
      provider,
      now: () => new Date(),
    },
    body,
  );

  sendJson(response, result);
}
