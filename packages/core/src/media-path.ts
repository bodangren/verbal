import path from "node:path";
import { ProjectError } from "./errors";
import { resolveInsideProject } from "./paths";
import type { ProjectDocument } from "./project";

/**
 * Resolves the file a project plays, or null when it references no media.
 *
 * A copied asset is project-relative and is proven to stay inside the project.
 * An external asset is referenced in place, so it must be absolute; a relative
 * one would mean something different on every machine.
 */
export function resolveMediaPath(
  project: ProjectDocument,
  projectRoot: string,
): string | null {
  const media = project.media;
  if (media === undefined) {
    return null;
  }

  if (media.assetPath !== undefined) {
    return resolveInsideProject(projectRoot, media.assetPath);
  }

  if (media.externalPath !== undefined) {
    if (!path.isAbsolute(media.externalPath)) {
      throw new ProjectError(
        "invalid-path",
        `external media path must be absolute: ${media.externalPath}`,
      );
    }
    return media.externalPath;
  }

  return null;
}
