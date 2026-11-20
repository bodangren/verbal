/** Machine-readable failure reasons for project documents and paths. */
export type ProjectErrorCode =
  | "invalid-json"
  | "unsupported-version"
  | "invalid-document"
  | "invalid-path"
  | "not-found"
  | "already-exists";

/** Error raised when a project document or path fails validation. */
export class ProjectError extends Error {
  readonly code: ProjectErrorCode;

  constructor(code: ProjectErrorCode, message: string) {
    super(message);
    this.name = "ProjectError";
    this.code = code;
  }
}
