// @vitest-environment node
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { PayloadTooLargeError, readJsonBody, sendJson } from "./http";

function bodyRequest(chunks: Buffer[], headers: Record<string, string> = {}) {
  const request = Readable.from(chunks) as unknown as IncomingMessage;
  Object.assign(request, { headers });
  return request;
}

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

describe("readJsonBody", () => {
  it("parses a body within the limit", async () => {
    const request = bodyRequest([Buffer.from('{"a":'), Buffer.from("1}")]);

    expect(await readJsonBody(request, 1024)).toEqual({ a: 1 });
  });

  it("rejects a streamed body above the limit before it reads the whole body", async () => {
    let pulled = 0;
    const chunks = Array.from({ length: 10 }, () => Buffer.alloc(1024, 0x20));
    const request = Readable.from(
      (async function* () {
        for (const chunk of chunks) {
          pulled += 1;
          yield chunk;
        }
      })(),
    ) as unknown as IncomingMessage;
    Object.assign(request, { headers: {} });

    await expect(readJsonBody(request, 4 * 1024)).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(pulled).toBeLessThan(chunks.length);
  });

  it("rejects a declared content-length above the limit without reading the body", async () => {
    let read = false;
    const request = new Readable({
      read() {
        read = true;
        this.push(null);
      },
    }) as unknown as IncomingMessage;
    Object.assign(request, { headers: { "content-length": "99999" } });

    await expect(readJsonBody(request, 1024)).rejects.toMatchObject({ status: 413 });
    expect(read).toBe(false);
  });

  it("answers 413 to a real request above the limit", async () => {
    const server = createServer(async (request, response) => {
      try {
        sendJson(response, { status: 200, body: await readJsonBody(request, 16) });
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          sendJson(response, { status: 413, body: { error: error.message } });
          return;
        }
        throw error;
      }
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;

    const response = await fetch(`http://127.0.0.1:${port}/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "x".repeat(200) }),
    });

    expect(response.status).toBe(413);
  });
});
