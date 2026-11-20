import type { IncomingMessage, ServerResponse } from "node:http";
import { nodeFileSystem, planBatch, projectPaths, type BatchProject } from "@verbal/core";
import { failure } from "../../../server/api-errors";
import { runBatch } from "../../../server/batch-runner";
import { methodNotAllowed, readJsonBody, sendJson } from "../../../server/http";
import { getJobRegistry } from "../../../server/registry";
import { createTranscribeService } from "../../../server/transcribe-service";
import { asRecord, requireAbsolutePath } from "../../../server/validation";

async function hasTranscript(root: string): Promise<boolean> {
  try {
    await nodeFileSystem.readFile(projectPaths(root).transcript);
    return true;
  } catch {
    return false;
  }
}

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
    const rawRoots = body.roots;

    if (!Array.isArray(rawRoots)) {
      sendJson(response, { status: 400, body: { error: "roots must be an array" } });
      return;
    }

    const service = createTranscribeService();
    const roots = rawRoots.map((entry, position) =>
      requireAbsolutePath(entry, `roots[${position}]`),
    );

    const projects: BatchProject[] = [];
    for (const root of roots) {
      projects.push({
        root,
        hasMedia: (await service.mediaPathFor(root)) !== null,
        hasTranscript: await hasTranscript(root),
      });
    }

    const plan = planBatch({ projects, force: body.force === true });

    const registry = await getJobRegistry();
    const job = await registry.create("transcribe");

    // The caller gets the plan immediately; per-item outcomes arrive as the job's
    // result, so a long batch needs no open request.
    void (async () => {
      try {
        await registry.start(job.id);

        const { outcomes } = await runBatch({
          plan,
          transcribe: (root) => service.transcribeNow(root).then(() => undefined),
          report: (outcome, done, total) => {
            void registry.progress(
              job.id,
              total === 0 ? 1 : done / total,
              `${outcome.root}: ${outcome.status}`,
            );
          },
        });

        await registry.complete(job.id, { outcomes });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await registry.fail(job.id, message).catch(() => undefined);
      }
    })();

    sendJson(response, { status: 202, body: { plan, job } });
  } catch (error) {
    sendJson(response, failure(error));
  }
}
