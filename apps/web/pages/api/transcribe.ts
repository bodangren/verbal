import type { IncomingMessage, ServerResponse } from "node:http";
import { createWhisperProvider } from "@verbal/ai";
import {
  createTranscript,
  nodeFileSystem,
  openProject,
  projectPaths,
  resolveInsideProject,
  saveTranscript,
} from "@verbal/core";
import { failure } from "../../server/api-errors";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { getJobRegistry } from "../../server/registry";
import { runTranscriptionJob } from "../../server/transcribe-job";
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

    const apiKey = process.env.OPENAI_API_KEY ?? "";
    if (apiKey.trim() === "") {
      sendJson(response, {
        status: 503,
        body: { error: "OPENAI_API_KEY is not set" },
      });
      return;
    }

    const project = await openProject(nodeFileSystem, projectRoot);
    const mediaPath =
      project.media?.assetPath !== undefined
        ? resolveInsideProject(projectRoot, project.media.assetPath)
        : project.media?.externalPath;

    if (mediaPath === undefined) {
      sendJson(response, { status: 400, body: { error: "project has no media" } });
      return;
    }

    const baseUrl = process.env.OPENAI_BASE_URL;
    const provider = createWhisperProvider({
      apiKey,
      ...(baseUrl === undefined ? {} : { baseUrl }),
    });

    const registry = await getJobRegistry();
    const job = await registry.create("transcribe");

    void runTranscriptionJob({
      registry,
      jobId: job.id,
      provider,
      request: { filePath: mediaPath },
      onTranscript: async (result) => {
        const transcript = createTranscript(result.words);
        await saveTranscript(
          nodeFileSystem,
          projectPaths(projectRoot).transcript,
          transcript,
        );
      },
    });

    sendJson(response, { status: 202, body: job });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
