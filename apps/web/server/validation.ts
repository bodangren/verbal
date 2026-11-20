import path from "node:path";
import { ProjectError } from "@verbal/core";

export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Validates a client-supplied absolute path before it reaches the file system. */
export function requireAbsolutePath(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProjectError("invalid-path", `${field} is required`);
  }
  if (!path.isAbsolute(value)) {
    throw new ProjectError("invalid-path", `${field} must be an absolute path`);
  }
  if (value.includes("\0")) {
    throw new ProjectError("invalid-path", `${field} contains a null byte`);
  }
  return path.normalize(value);
}

export function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProjectError("invalid-document", `${field} is required`);
  }
  return value.trim();
}
