import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiResponse } from "./jobs-api";

/** Writes an API result as JSON. */
export function sendJson(response: ServerResponse, result: ApiResponse): void {
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(result.body));
}

/** Default byte limit for a JSON body: 10 MiB. */
export const MAX_JSON_BYTES = 10 * 1024 * 1024;

/** A request body exceeds its byte limit. Maps to HTTP 413. */
export class PayloadTooLargeError extends Error {
  readonly status = 413;

  constructor(limit: number) {
    super(`request body exceeds ${limit} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

/**
 * Reads a JSON body; malformed or empty bodies become undefined.
 *
 * A declared length above `limit` is refused before any byte is read. A
 * streamed body is cut off as soon as it passes `limit`.
 */
export async function readJsonBody(
  request: IncomingMessage,
  limit: number = MAX_JSON_BYTES,
): Promise<unknown> {
  // vinext parses JSON bodies before invoking the handler. Reading the stream
  // in that case yields nothing, so prefer an already-parsed body.
  const parsedBody = (request as { body?: unknown }).body;
  if (parsedBody !== undefined) {
    return parsedBody;
  }

  const declaredLength = Number(request.headers["content-length"]);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    throw new PayloadTooLargeError(limit);
  }

  const chunks: Buffer[] = [];
  let received = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    received += buffer.length;
    if (received > limit) {
      throw new PayloadTooLargeError(limit);
    }
    chunks.push(buffer);
  }

  if (chunks.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return undefined;
  }
}

export function methodNotAllowed(response: ServerResponse, allowed: string): void {
  response.statusCode = 405;
  response.setHeader("Allow", allowed);
  response.end();
}
