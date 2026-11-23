import path from "node:path";
import {
  nodeFileSystem,
  ProjectError,
  writeFileAtomic,
  type FileSystem,
} from "@verbal/core";
import { asRecord, requireAbsolutePath } from "./validation";

const SCRIPT_FILE = "script.md";
/** A script is prose, not a document store; this is a generous ceiling. */
const MAX_SCRIPT_CHARS = 200_000;

export type ScriptApiDeps = {
  fs: FileSystem;
};

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Reads and writes the project's teleprompter script.
 *
 * The script lives in `script.md` beside the project documents. A missing file
 * is an empty script, so a new project needs no initialization. Writes are
 * atomic, so a reload never sees half a script.
 */
export function createScriptApi(overrides: Partial<ScriptApiDeps> = {}) {
  const fs = overrides.fs ?? nodeFileSystem;

  return {
    async read(root: string): Promise<string> {
      const safeRoot = requireAbsolutePath(root, "root");
      try {
        return await fs.readFile(path.join(safeRoot, SCRIPT_FILE));
      } catch (error) {
        if (isNotFound(error)) {
          return "";
        }
        throw error;
      }
    },

    async write(input: unknown): Promise<string> {
      const body = asRecord(input);
      const root = requireAbsolutePath(body.root, "root");
      const script = body.script;

      if (typeof script !== "string") {
        throw new ProjectError("invalid-document", "script must be a string");
      }
      if (script.length > MAX_SCRIPT_CHARS) {
        throw new ProjectError(
          "invalid-document",
          `script must be at most ${MAX_SCRIPT_CHARS} characters`,
        );
      }

      await writeFileAtomic(fs, path.join(root, SCRIPT_FILE), script);
      return script;
    },
  };
}
