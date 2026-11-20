import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createOpenAiVideoProvider } from "@verbal/ai";
import { createFileAssetStore, nodeAssetFileSystem } from "@verbal/compose";
import { nodeFileSystem } from "@verbal/core";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { clearJobAbort, registerJobAbort } from "../../../server/job-aborts";
import { getJobRegistry } from "../../../server/registry";
import { asRecord, requireAbsolutePath } from "../../../server/validation";
import { generateSceneVideo } from "../../../server/video-api";
import { runVideoJob } from "../../../server/video-job";

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
  const provider = createOpenAiVideoProvider({
    apiKey: apiKey === "" ? "unused-for-estimate" : apiKey,
    ...(baseUrl === undefined ? {} : { baseUrl }),
  });

  const registry = await getJobRegistry();
  const assets = createFileAssetStore(
    nodeAssetFileSystem,
    path.join(root, "assets", "generated"),
  );

  const result = await generateSceneVideo(
    {
      fs: nodeFileSystem,
      registry,
      assets,
      provider,
      now: () => new Date(),
      runJob: async (jobId, sceneId, videoRequest) => {
        const controller = registerJobAbort(jobId);
        try {
          return await runVideoJob(
            {
              registry,
              assets,
              provider,
              now: () => new Date(),
              signal: controller.signal,
            },
            { jobId, sceneId, request: videoRequest },
          );
        } finally {
          clearJobAbort(jobId);
        }
      },
    },
    body,
  );

  sendJson(response, result);
}
