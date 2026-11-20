import { readdir } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ProjectError, nodeFileSystem, scanLibrary } from "@verbal/core";
import { failure } from "../../../server/api-errors";
import { methodNotAllowed, sendJson } from "../../../server/http";
import { requireAbsolutePath } from "../../../server/validation";

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method !== "GET") {
    methodNotAllowed(response, "GET");
    return;
  }

  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const folder = requireAbsolutePath(url.searchParams.get("folder"), "folder");

    const projects = await scanLibrary(folder, {
      fs: nodeFileSystem,
      listDirectory: async (directory) => {
        const entries = await readdir(directory, { withFileTypes: true });
        return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      },
    });

    sendJson(response, { status: 200, body: { projects } });
  } catch (error) {
    if (isNotFound(error)) {
      sendJson(response, failure(new ProjectError("invalid-path", "that folder does not exist")));
      return;
    }
    sendJson(response, failure(error));
  }
}
