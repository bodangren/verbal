import type { IncomingMessage, ServerResponse } from "node:http";
import { checkTools } from "@verbal/media";

export default async function handler(_request: IncomingMessage, response: ServerResponse) {
  const tools = await checkTools();

  response.statusCode = 200;
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify({ node: process.version, tools }));
}
