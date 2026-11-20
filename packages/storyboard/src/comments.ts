import { StoryboardError } from "./types";

export const COMMENTS_SCHEMA_VERSION = 1;

export type CommentAnchor =
  | { kind: "time"; seconds: number }
  | { kind: "scene"; sceneId: string }
  | { kind: "word"; wordId: string };

export type Comment = {
  id: string;
  text: string;
  anchor: CommentAnchor;
  createdAt: string;
  resolved?: boolean;
};

export type CommentsDocument = {
  schemaVersion: number;
  comments: Comment[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown, field: string, id: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new StoryboardError("invalid-document", `comment ${id}: ${field} must be non-empty`);
  }
  return value;
}

function parseAnchor(value: unknown, id: string): CommentAnchor {
  if (!isRecord(value)) {
    throw new StoryboardError("invalid-document", `comment ${id}: anchor must be an object`);
  }

  switch (value.kind) {
    case "time": {
      const seconds = value.seconds;
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) {
        throw new StoryboardError(
          "invalid-document",
          `comment ${id}: anchor seconds must be a non-negative number`,
        );
      }
      return { kind: "time", seconds };
    }

    case "scene":
      return { kind: "scene", sceneId: nonEmpty(value.sceneId, "anchor sceneId", id) };

    case "word":
      return { kind: "word", wordId: nonEmpty(value.wordId, "anchor wordId", id) };

    default:
      throw new StoryboardError(
        "invalid-document",
        `comment ${id}: anchor kind must be time, scene, or word`,
      );
  }
}

function parseComment(value: unknown, seen: Set<string>): Comment {
  if (!isRecord(value)) {
    throw new StoryboardError("invalid-document", "comment must be an object");
  }

  const id = nonEmpty(value.id, "id", "<unknown>");
  if (seen.has(id)) {
    throw new StoryboardError("invalid-document", `duplicate comment id: ${id}`);
  }
  seen.add(id);

  const comment: Comment = {
    id,
    text: nonEmpty(value.text, "text", id),
    anchor: parseAnchor(value.anchor, id),
    createdAt: nonEmpty(value.createdAt, "createdAt", id),
  };

  if (value.resolved !== undefined && value.resolved !== null) {
    if (typeof value.resolved !== "boolean") {
      throw new StoryboardError("invalid-document", `comment ${id}: resolved must be a boolean`);
    }
    comment.resolved = value.resolved;
  }

  return comment;
}

/** Validates an untrusted comments document. */
export function validateComments(value: unknown): CommentsDocument {
  if (!isRecord(value)) {
    throw new StoryboardError("invalid-document", "comments document must be an object");
  }

  const { schemaVersion, comments } = value;

  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    throw new StoryboardError("invalid-document", "schemaVersion must be an integer");
  }
  if (schemaVersion > COMMENTS_SCHEMA_VERSION) {
    throw new StoryboardError(
      "unsupported-version",
      `comments schemaVersion ${schemaVersion} is newer than supported version ${COMMENTS_SCHEMA_VERSION}`,
    );
  }
  if (schemaVersion < 1) {
    throw new StoryboardError("invalid-document", "schemaVersion must be at least 1");
  }
  if (!Array.isArray(comments)) {
    throw new StoryboardError("invalid-document", "comments must be an array");
  }

  const seen = new Set<string>();

  return {
    schemaVersion,
    comments: comments.map((comment) => parseComment(comment, seen)),
  };
}

/** Parses and validates anchored comments. */
export function parseComments(raw: string): CommentsDocument {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new StoryboardError("invalid-json", "comments are not valid JSON");
  }

  return validateComments(value);
}

/** Serialises comments with a stable, diff-friendly layout. */
export function serializeComments(document: CommentsDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}
