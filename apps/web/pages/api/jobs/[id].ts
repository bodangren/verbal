import type { IncomingMessage, ServerResponse } from "node:http";
import { methodNotAllowed, sendJson } from "../../../server/http";
import { createJobApi } from "../../../server/jobs-api";
import { abortCapture } from "../../../server/capture-registry";
import { getJobRegistry } from "../../../server/registry";

function jobIdFromUrl(url: string | undefined): string {
  const pathname = (url ?? "").split("?")[0] ?? "";
  const segments = pathname.split("/").filter((segment) => segment !== "");
  return decodeURIComponent(segments.at(-1) ?? "");
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const api = createJobApi(await getJobRegistry());
  const id = jobIdFromUrl(request.url);
  const method = request.method ?? "GET";

  if (method === "GET") {
    sendJson(response, api.get(id));
    return;
  }

  if (method === "DELETE") {
    abortCapture(id);
    sendJson(response, await api.cancel(id));
    return;
  }

  methodNotAllowed(response, "GET, DELETE");
}
