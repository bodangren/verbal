import { promises as nodeFs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { nodeFileSystem, openProject, replaceProjectMedia, saveProject } from "@verbal/core";
import { failure } from "../../server/api-errors";
import { buildTakeEdl, edlDuration } from "../../server/assembly";
import { runAssemblyJob } from "../../server/assembly-job";
import { spawnCapture } from "../../server/capture-spawn";
import { methodNotAllowed, readJsonBody, sendJson } from "../../server/http";
import { getJobRegistry } from "../../server/registry";
import { withProjectLock } from "../../server/project-lock";
import { createScriptApi } from "../../server/script-api";
import { normalizeTakeId } from "../../server/take-api";
import { takeMediaPath } from "../../server/take-store";
import { readTakeTranscript } from "../../server/take-transcript";
import { asRecord, requireAbsolutePath } from "../../server/validation";

/**
 * Builds the EDL for one take, and optionally renders it.
 *
 * `render: true` cuts every kept range and concatenates the segments. The
 * assembled MP4 becomes the project media, so the player and export see the
 * cut; without `render`, the response is just the range plan.
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

    if (body.render !== true) {
      sendJson(response, {
        status: 200,
        body: { ranges: edl.ranges, durationSeconds: edlDuration(edl.ranges) },
      });
      return;
    }

    if (edl.ranges.length === 0) {
      sendJson(response, { status: 400, body: { error: "nothing to cut" } });
      return;
    }

    const registry = await getJobRegistry();
    const job = await registry.create("capture");
    const fileName = `assembled-${job.id}.mp4`;
    const assets = path.join(root, "assets");
    await nodeFs.mkdir(assets, { recursive: true });
    const outputPath = path.join(assets, fileName);

    void runAssemblyJob(
      {
        registry,
        spawn: spawnCapture,
        mkdir: async (target) => {
          await nodeFs.mkdir(target, { recursive: true });
        },
        writeFile: (target, data) => nodeFs.writeFile(target, data),
        unlink: (target) => nodeFs.unlink(target),
      },
      {
        jobId: job.id,
        ranges: edl.ranges,
        takePath: takeMediaPath(root, takeId),
        outputPath,
        workDir: path.join(root, "takes", `.assembly-${job.id}`),
        width: 1280,
        height: 720,
        fps: 30,
        onOutput: async () => {
          await withProjectLock(root, async () => {
            const project = await openProject(nodeFileSystem, root);
            const updated = await replaceProjectMedia(
              project,
              { assetPath: `assets/${fileName}` },
              {
                mediaPath: outputPath,
                stat: async (mediaPath) => {
                  const info = await nodeFs.stat(mediaPath);
                  return { size: info.size, mtimeMs: info.mtimeMs };
                },
              },
            );
            await saveProject(nodeFileSystem, root, updated);
          });
        },
      },
    );

    sendJson(response, { status: 202, body: job });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
