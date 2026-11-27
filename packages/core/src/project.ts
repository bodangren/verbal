import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { writeFileAtomic, type FileSystem } from "./atomic";
import { ProjectError } from "./errors";
import { assertRelativePath } from "./paths";

export { ProjectError } from "./errors";
export type { ProjectErrorCode } from "./errors";

/** Schema version written by this build. Newer versions are refused, not guessed at. */
export const PROJECT_SCHEMA_VERSION = 1;

export type ProjectMedia = {
  /** Project-relative path for a copied asset. */
  assetPath?: string;
  /** Absolute path for an asset referenced in place. */
  externalPath?: string;
  /** Revision of the media at import time; optional so old projects still open. */
  mediaRevision?: string;
};

export type MediaRevisionStat = {
  size: number;
  mtimeMs: number;
};

export type MediaRevisionSource = {
  /** Absolute path of the media file. */
  mediaPath: string;
  /** Reads the media file's size and mtime; injected so tests need no files. */
  stat: (mediaPath: string) => Promise<MediaRevisionStat> | MediaRevisionStat;
};

/** A short, stable revision of the media a project references. */
export async function computeMediaRevision(source: MediaRevisionSource): Promise<string> {
  const stat = await source.stat(source.mediaPath);
  return createHash("sha256")
    .update(source.mediaPath)
    .update("\u0000")
    .update(String(stat.size))
    .update("\u0000")
    .update(String(stat.mtimeMs))
    .digest("hex")
    .slice(0, 16);
}

/** True when both revisions exist and differ; a missing one is a match. */
export function mediaRevisionMismatch(
  mediaRevision: string | undefined,
  transcriptRevision: string | undefined,
): boolean {
  return (
    mediaRevision !== undefined &&
    transcriptRevision !== undefined &&
    mediaRevision !== transcriptRevision
  );
}

/** A media reference without its revision; `replaceProjectMedia` adds it. */
export type NewMediaReference = { assetPath: string } | { externalPath: string };

/**
 * Returns a project whose media is `newMedia` plus a fresh revision.
 *
 * Every path that swaps a project's media must go through here, so a new file
 * always gets a new revision and an old transcript is detected as stale. The
 * caller saves the returned document.
 */
export async function replaceProjectMedia(
  project: ProjectDocument,
  newMedia: NewMediaReference,
  source: MediaRevisionSource,
): Promise<ProjectDocument> {
  const mediaRevision = await computeMediaRevision(source);
  return { ...project, media: { ...newMedia, mediaRevision } };
}

export type ProjectDocument = {
  schemaVersion: number;
  id: string;
  name: string;
  createdAt: string;
  media?: ProjectMedia;
};

export type ProjectPaths = {
  root: string;
  project: string;
  transcript: string;
  edit: string;
  storyboard: string;
  comments: string;
  assets: string;
  cache: string;
  exports: string;
};

/** The standard paths inside a project directory. */
export function projectPaths(root: string): ProjectPaths {
  return {
    root,
    project: path.join(root, "project.json"),
    transcript: path.join(root, "transcript.json"),
    edit: path.join(root, "edit.json"),
    storyboard: path.join(root, "storyboard.json"),
    comments: path.join(root, "comments.json"),
    assets: path.join(root, "assets"),
    cache: path.join(root, "cache"),
    exports: path.join(root, "exports"),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProjectError("invalid-document", `${field} must be a non-empty string`);
  }
  return value;
}

/** Validates an untrusted value and returns a typed project document. */
export function validateProjectDocument(value: unknown): ProjectDocument {
  if (!isRecord(value)) {
    throw new ProjectError("invalid-document", "project document must be an object");
  }

  const { schemaVersion, id, name, createdAt, media } = value;

  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    throw new ProjectError("invalid-document", "schemaVersion must be an integer");
  }
  if (schemaVersion > PROJECT_SCHEMA_VERSION) {
    throw new ProjectError(
      "unsupported-version",
      `project schemaVersion ${schemaVersion} is newer than supported version ${PROJECT_SCHEMA_VERSION}`,
    );
  }
  if (schemaVersion < 1) {
    throw new ProjectError("invalid-document", "schemaVersion must be at least 1");
  }

  const document: ProjectDocument = {
    schemaVersion,
    id: nonEmptyString(id, "id"),
    name: nonEmptyString(name, "name"),
    createdAt: nonEmptyString(createdAt, "createdAt"),
  };

  if (Number.isNaN(Date.parse(document.createdAt))) {
    throw new ProjectError("invalid-document", "createdAt must be an ISO timestamp");
  }

  if (media !== undefined && media !== null) {
    if (!isRecord(media)) {
      throw new ProjectError("invalid-document", "media must be an object");
    }

    const hasAsset = media.assetPath !== undefined && media.assetPath !== null;
    const hasExternal = media.externalPath !== undefined && media.externalPath !== null;

    if (hasAsset === hasExternal) {
      throw new ProjectError(
        "invalid-document",
        "media must specify exactly one of assetPath or externalPath",
      );
    }

    if (hasAsset) {
      const parsed: ProjectMedia = {
        assetPath: assertRelativePath(nonEmptyString(media.assetPath, "media.assetPath")),
      };
      if (media.mediaRevision !== undefined && media.mediaRevision !== null) {
        parsed.mediaRevision = nonEmptyString(media.mediaRevision, "media.mediaRevision");
      }
      document.media = parsed;
    } else {
      const external = nonEmptyString(media.externalPath, "media.externalPath");
      if (!path.isAbsolute(external) || external.includes("\0")) {
        throw new ProjectError(
          "invalid-path",
          `external media paths must be absolute: ${external}`,
        );
      }
      const parsed: ProjectMedia = { externalPath: path.normalize(external) };
      if (media.mediaRevision !== undefined && media.mediaRevision !== null) {
        parsed.mediaRevision = nonEmptyString(media.mediaRevision, "media.mediaRevision");
      }
      document.media = parsed;
    }
  }

  return document;
}

/** Parses and validates a project document. */
export function parseProjectDocument(raw: string): ProjectDocument {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new ProjectError("invalid-json", "project document is not valid JSON");
  }

  return validateProjectDocument(value);
}

/** Serialises a project document with a stable, diff-friendly layout. */
export function serializeProjectDocument(document: ProjectDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

export type CreateProjectOptions = {
  name: string;
  id?: string;
  /** Injectable clock, so tests can assert an exact timestamp. */
  now?: () => Date;
};

/**
 * Creates a project directory and its document.
 *
 * Refuses to overwrite an existing project: clobbering a `project.json` is
 * never the intent of "create".
 */
export async function createProject(
  fs: FileSystem,
  root: string,
  options: CreateProjectOptions,
): Promise<ProjectDocument> {
  const name = options.name.trim();
  if (name === "") {
    throw new ProjectError("invalid-document", "project name must not be empty");
  }

  const paths = projectPaths(root);

  try {
    await fs.readFile(paths.project);
    throw new ProjectError("already-exists", `a project already exists at ${root}`);
  } catch (error) {
    if (error instanceof ProjectError) {
      throw error;
    }
    if (!isNotFound(error)) {
      throw error;
    }
  }

  await fs.mkdir(paths.root);
  await fs.mkdir(paths.assets);
  await fs.mkdir(paths.cache);
  await fs.mkdir(paths.exports);

  const document: ProjectDocument = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: options.id ?? randomUUID(),
    name,
    createdAt: (options.now?.() ?? new Date()).toISOString(),
  };

  await writeFileAtomic(fs, paths.project, serializeProjectDocument(document));

  return document;
}

/** Reads and validates the project document in `root`. */
export async function openProject(fs: FileSystem, root: string): Promise<ProjectDocument> {
  const paths = projectPaths(root);
  let raw: string;

  try {
    raw = await fs.readFile(paths.project);
  } catch (error) {
    if (isNotFound(error)) {
      throw new ProjectError("not-found", `no project at ${root}`);
    }
    throw error;
  }

  return parseProjectDocument(raw);
}

/** Writes a validated project document atomically. */
export async function saveProject(
  fs: FileSystem,
  root: string,
  document: ProjectDocument,
): Promise<void> {
  const paths = projectPaths(root);
  await fs.mkdir(paths.root);
  await writeFileAtomic(fs, paths.project, serializeProjectDocument(document));
}
