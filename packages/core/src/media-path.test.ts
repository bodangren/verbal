import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectError } from "./errors";
import { resolveMediaPath } from "./media-path";
import type { ProjectDocument } from "./project";

const ROOT = path.join(path.sep, "tmp", "verbal-project");

function project(media?: ProjectDocument["media"]): ProjectDocument {
  return {
    schemaVersion: 1,
    id: "p1",
    name: "Playback",
    createdAt: "2026-11-21T00:00:00.000Z",
    ...(media === undefined ? {} : { media }),
  };
}

describe("resolveMediaPath", () => {
  it("returns null when the project has no media", () => {
    expect(resolveMediaPath(project(), ROOT)).toBeNull();
  });

  it("prefers the project-relative asset path", () => {
    expect(
      resolveMediaPath(
        project({ assetPath: "assets/take.mp4", externalPath: "/media/other.mp4" }),
        ROOT,
      ),
    ).toBe(path.join(ROOT, "assets", "take.mp4"));
  });

  it("falls back to the absolute external path", () => {
    expect(resolveMediaPath(project({ externalPath: "/media/take.mp4" }), ROOT)).toBe(
      "/media/take.mp4",
    );
  });

  it("refuses an asset path that climbs out of the project", () => {
    expect(() => resolveMediaPath(project({ assetPath: "../escape.mp4" }), ROOT)).toThrow(
      ProjectError,
    );
  });

  it("refuses a relative external path", () => {
    expect(() => resolveMediaPath(project({ externalPath: "media/take.mp4" }), ROOT)).toThrow(
      ProjectError,
    );
  });

  it("returns null when the media object is empty", () => {
    expect(resolveMediaPath(project({}), ROOT)).toBeNull();
  });
});
