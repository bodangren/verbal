import type { IncomingMessage, ServerResponse } from "node:http";
import {
  nodeFileSystem,
  openProject,
  parseTranscript,
  projectPaths,
  resolveInsideProject,
} from "@verbal/core";
import { buildCutList, probeMedia, runCommand, runExport } from "@verbal/media";
import { resolvePreset, withPresetExtension } from "@verbal/media/presets";
import { failure } from "../../server/api-errors";
import { runExportJob } from "../../server/export-job";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { getJobRegistry } from "../../server/registry";
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
    // An unknown preset is not an error: a stale choice still exports.
    const preset = resolvePreset(typeof body.preset === "string" ? body.preset : undefined);
    const outputPath = withPresetExtension(
      requireAbsolutePath(body.outputPath, "outputPath"),
      preset,
    );

    const project = await openProject(nodeFileSystem, projectRoot);
    const mediaPath =
      project.media?.assetPath !== undefined
        ? resolveInsideProject(projectRoot, project.media.assetPath)
        : project.media?.externalPath;

    if (mediaPath === undefined) {
      sendJson(response, { status: 400, body: { error: "project has no media" } });
      return;
    }

    const transcript = parseTranscript(
      await nodeFileSystem.readFile(projectPaths(projectRoot).transcript),
    );
    const info = await probeMedia(runCommand, mediaPath);
    const cutList = buildCutList({
      transcript,
      durationSeconds: info.durationSeconds ?? 0,
    });
    const hasAudio = info.streams.some((stream) => stream.kind === "audio");

    const registry = await getJobRegistry();
    const job = await registry.create("export");

    void runExportJob(registry, job.id, async (report, signal) => {
      await runExport({
        inputPath: mediaPath,
        outputPath,
        kept: cutList.kept,
        hasAudio,
        codecs: preset.codecs,
        signal,
        onProgress: (event) => {
          report(event.percent);
        },
      });

      return { outputPath, preset: preset.id };
    });

    sendJson(response, { status: 202, body: job });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
