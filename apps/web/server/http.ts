import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiResponse } from "./jobs-api";

/** Writes an API result as JSON. */
export function sendJson(response: ServerResponse, result: ApiResponse): void {
  response.statusCode = result.status;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(result.body));
}

/** Reads a JSON body; malformed or empty bodies become undefined. */
export async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  // vinext parses JSON bodies before invoking the handler. Reading the stream
  // in that case yields nothing, so prefer an already-parsed body.
  const parsedBody = (request as { body?: unknown }).body;
  if (parsedBody !== undefined) {
    return parsedBody;
  }

  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
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
