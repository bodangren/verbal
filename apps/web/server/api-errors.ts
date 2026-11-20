import { AiError } from "@verbal/ai";
import { JobError, ProjectError } from "@verbal/core";
import { CutListError, ExportError, MediaError, ProbeError } from "@verbal/media";
import type { ApiResponse } from "./jobs-api";

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function statusFor(error: unknown): number {
  if (error instanceof ProjectError) {
    switch (error.code) {
      case "not-found":
        return 404;
      case "already-exists":
      case "unsupported-version":
        return 409;
      default:
        return 400;
    }
  }

  if (error instanceof JobError) {
    return error.code === "not-found" ? 404 : 409;
  }

  if (error instanceof AiError) {
    return error.code === "not-configured" ? 503 : 502;
  }

  if (error instanceof MediaError || error instanceof ProbeError || error instanceof CutListError) {
    return 400;
  }

  if (error instanceof ExportError) {
    return error.code === "cancelled" ? 409 : 502;
  }

  return 500;
}

export function failure(error: unknown): ApiResponse {
  return { status: statusFor(error), body: { error: messageOf(error) } };
}
