import { describe, expect, it } from "vitest";
import {
  COMMENTS_SCHEMA_VERSION,
  parseComments,
  serializeComments,
  type CommentsDocument,
} from "./comments";

const stamps = "2026-11-20T00:00:00.000Z";

function documentOf(): CommentsDocument {
  return {
    schemaVersion: COMMENTS_SCHEMA_VERSION,
    comments: [
      { id: "c1", text: "Too long", anchor: { kind: "time", seconds: 12.5 }, createdAt: stamps },
      {
        id: "c2",
        text: "Swap this",
        anchor: { kind: "scene", sceneId: "s1" },
        createdAt: stamps,
      },
      { id: "c3", text: "Word", anchor: { kind: "word", wordId: "w3" }, createdAt: stamps },
    ],
  };
}

describe("comments", () => {
  it("round-trips through serialisation", () => {
    const document = documentOf();

    expect(parseComments(serializeComments(document))).toEqual(document);
  });

  it("ends serialisation with a newline", () => {
    expect(serializeComments(documentOf()).endsWith("\n")).toBe(true);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseComments("{nope")).toThrow(/JSON/i);
  });

  it("rejects duplicate comment ids", () => {
    const document = documentOf();
    document.comments.push({ ...document.comments[0]!, id: "c1" });

    expect(() => parseComments(JSON.stringify(document))).toThrow(/duplicate/i);
  });

  it("rejects an unknown anchor kind", () => {
    const document = JSON.stringify({
      schemaVersion: COMMENTS_SCHEMA_VERSION,
      comments: [
        {
          id: "c1",
          text: "x",
          anchor: { kind: "frame", frame: 3 },
          createdAt: stamps,
        },
      ],
    });

    expect(() => parseComments(document)).toThrow(/anchor/i);
  });

  it("rejects a negative time anchor", () => {
    const document = JSON.stringify({
      schemaVersion: COMMENTS_SCHEMA_VERSION,
      comments: [
        { id: "c1", text: "x", anchor: { kind: "time", seconds: -1 }, createdAt: stamps },
      ],
    });

    expect(() => parseComments(document)).toThrow(/seconds/i);
  });

  it("rejects empty comment text", () => {
    const document = JSON.stringify({
      schemaVersion: COMMENTS_SCHEMA_VERSION,
      comments: [
        { id: "c1", text: "  ", anchor: { kind: "scene", sceneId: "s1" }, createdAt: stamps },
      ],
    });

    expect(() => parseComments(document)).toThrow(/text/i);
  });

  it("rejects a newer schema version", () => {
    const document = JSON.stringify({
      schemaVersion: COMMENTS_SCHEMA_VERSION + 1,
      comments: [],
    });

    expect(() => parseComments(document)).toThrow(/newer/i);
  });
});
