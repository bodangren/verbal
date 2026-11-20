import { createProject, nodeFileSystem, openProject, type FileSystem } from "@verbal/core";
import { failure } from "./api-errors";
import type { ApiResponse } from "./jobs-api";
import { asRecord, requireAbsolutePath, requireString } from "./validation";

/** Project lifecycle endpoints. */
export function createProjectApi(fs: FileSystem = nodeFileSystem) {
  return {
    async create(input: unknown): Promise<ApiResponse> {
      try {
        const body = asRecord(input);
        const root = requireAbsolutePath(body.root, "root");
        const name = requireString(body.name, "name");
        return { status: 201, body: await createProject(fs, root, { name }) };
      } catch (error) {
        return failure(error);
      }
    },

    async open(input: unknown): Promise<ApiResponse> {
      try {
        const root = requireAbsolutePath(asRecord(input).root, "root");
        return { status: 200, body: await openProject(fs, root) };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
