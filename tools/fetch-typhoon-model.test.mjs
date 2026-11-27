import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { download } from "./fetch-typhoon-model.mjs";

const BODY = Buffer.from(Array.from({ length: 4096 }, (_, i) => i % 251));
const SPLIT = Math.floor(BODY.length / 2);

function digest(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function fileSpec(overrides = {}) {
  return {
    remote: "model.onnx",
    local: "model.onnx",
    bytes: BODY.length,
    sha256: digest(BODY),
    ...overrides,
  };
}

let dir;
let servers;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "verbal-fetch-test-"));
  servers = [];
});

afterEach(async () => {
  for (const { server, sockets } of servers) {
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise((resolve) => server.close(resolve));
  }
  await rm(dir, { recursive: true, force: true });
});

async function startServer(handler) {
  const sockets = new Set();
  const server = createServer((req, res) => handler(req, res));
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push({ server, sockets });
  return `http://127.0.0.1:${server.address().port}`;
}

describe("download", () => {
  it("resumes from the .part size after a partial body", async () => {
    const ranges = [];
    const base = await startServer((req, res) => {
      const range = req.headers.range;
      ranges.push(range);
      if (!range) {
        res.writeHead(200, { "content-type": "application/octet-stream" });
        res.end(BODY.subarray(0, SPLIT));
        return;
      }
      const start = Number(/^bytes=(\d+)-$/.exec(range)[1]);
      res.writeHead(206, {
        "content-type": "application/octet-stream",
        "content-range": `bytes ${start}-${BODY.length - 1}/${BODY.length}`,
        "content-length": BODY.length - start,
      });
      res.end(BODY.subarray(start));
    });

    const spec = fileSpec();
    const target = path.join(dir, spec.local);
    await expect(download(spec, target, base, { inactivityMs: 2000 })).rejects.toThrow(
      /verification|size/i,
    );
    await expect(stat(`${target}.part`)).resolves.toMatchObject({ size: SPLIT });

    await download(spec, target, base, { inactivityMs: 2000 });
    expect(ranges).toEqual([undefined, `bytes=${SPLIT}-`]);
    await expect(readFile(target)).resolves.toEqual(BODY);
    await expect(stat(`${target}.part`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("never publishes a file with a bad sha256", async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { "content-length": BODY.length });
      res.end(BODY);
    });
    const spec = fileSpec({ sha256: "0".repeat(64) });
    const target = path.join(dir, spec.local);

    await expect(download(spec, target, base, { inactivityMs: 2000 })).rejects.toThrow(
      /verification|sha256/i,
    );
    await expect(stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(stat(`${target}.part`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("aborts after the inactivity window and keeps the partial file", async () => {
    const base = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.write(BODY.subarray(0, 1024));
    });
    const spec = fileSpec();
    const target = path.join(dir, spec.local);
    const started = Date.now();

    await expect(download(spec, target, base, { inactivityMs: 200 })).rejects.toThrow(
      /inactiv|stall|timeout/i,
    );
    expect(Date.now() - started).toBeLessThan(5000);
    await expect(stat(`${target}.part`)).resolves.toMatchObject({ size: 1024 });
    await expect(stat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("restarts the file when the server answers 200 instead of 206", async () => {
    const ranges = [];
    const base = await startServer((req, res) => {
      ranges.push(req.headers.range);
      res.writeHead(200, { "content-length": BODY.length });
      res.end(BODY);
    });
    const spec = fileSpec();
    const target = path.join(dir, spec.local);
    await writeFile(`${target}.part`, BODY.subarray(0, SPLIT));

    await download(spec, target, base, { inactivityMs: 2000 });
    expect(ranges).toEqual([`bytes=${SPLIT}-`]);
    await expect(readFile(target)).resolves.toEqual(BODY);
    await expect(stat(`${target}.part`)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("publishes a complete .part when the server answers 416", async () => {
    const ranges = [];
    const base = await startServer((req, res) => {
      ranges.push(req.headers.range);
      res.writeHead(416);
      res.end();
    });
    const spec = fileSpec();
    const target = path.join(dir, spec.local);
    await writeFile(`${target}.part`, BODY);

    await download(spec, target, base, { inactivityMs: 2000 });
    expect(ranges).toEqual([`bytes=${BODY.length}-`]);
    await expect(readFile(target)).resolves.toEqual(BODY);
  });
});
