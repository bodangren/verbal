import path from "node:path";
import { promises as nodeFs } from "node:fs";
import { projectPaths } from "@verbal/core";

export type MediaErrorCode =
  | "invalid-filename"
  | "invalid-source"
  | "invalid-option"
  | "already-exists";

/** Error raised by media import operations. */
export class MediaError extends Error {
  readonly code: MediaErrorCode;

  constructor(code: MediaErrorCode, message: string) {
    super(message);
    this.name = "MediaError";
    this.code = code;
  }
}

/** File operations needed to bring a file into a project. */
export interface ImportFileSystem {
  mkdir(path: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export type ImportMode = "copy" | "reference";

/** Production file operations for import. */
export const nodeImportFileSystem: ImportFileSystem = {
  async mkdir(path: string): Promise<void> {
    await nodeFs.mkdir(path, { recursive: true });
  },

  async copyFile(from: string, to: string): Promise<void> {
    await nodeFs.copyFile(from, to);
  },

  async exists(path: string): Promise<boolean> {
    try {
      await nodeFs.access(path);
      return true;
    } catch {
      return false;
    }
  },
};

export type ImportRequest = {
  mode: ImportMode;
  sourcePath: string;
  projectRoot: string;
  /** Overrides the destination file name; must not contain a path. */
  fileName?: string;
};

export type ImportResult =
  | { mode: "copy"; assetPath: string; absolutePath: string }
  | { mode: "reference"; externalPath: string };

function safeFileName(candidate: string): string {
  if (candidate.trim() === "") {
    throw new MediaError("invalid-filename", "file name must not be empty");
  }

  const base = path.basename(candidate);
  if (base !== candidate || base === "." || base === "..") {
    throw new MediaError("invalid-filename", `file name must not contain a path: ${candidate}`);
  }

  return base;
}

/**
 * Brings a media file into a project.
 *
 * `copy` places the file under `assets/` and returns a project-relative path.
 * `reference` leaves the file where it is and returns an absolute external
 * path, so large footage does not get duplicated.
 */
export async function importMedia(
  fs: ImportFileSystem,
  request: ImportRequest,
): Promise<ImportResult> {
  if (request.mode === "reference") {
    if (!path.isAbsolute(request.sourcePath)) {
      throw new MediaError(
        "invalid-source",
        `reference imports require an absolute path: ${request.sourcePath}`,
      );
    }
    return { mode: "reference", externalPath: path.resolve(request.sourcePath) };
  }

  const source = path.resolve(request.sourcePath);
  const fileName = safeFileName(request.fileName ?? path.basename(source));
  const paths = projectPaths(request.projectRoot);
  const destination = path.join(paths.assets, fileName);

  await fs.mkdir(paths.assets);

  if (await fs.exists(destination)) {
    throw new MediaError("already-exists", `asset already exists: ${fileName}`);
  }

  await fs.copyFile(source, destination);

  return {
    mode: "copy",
    assetPath: path.posix.join("assets", fileName),
    absolutePath: destination,
  };
}
