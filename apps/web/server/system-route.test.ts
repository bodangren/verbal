// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@verbal/media", () => ({
  checkTools: async () => ({ ffmpeg: true, ffprobe: true }),
}));

import handler from "../pages/api/system";

type Transcription = { mode: string; label: string; cloud: boolean; hint?: string };

async function callHandler(): Promise<{ status: number; transcription: Transcription }> {
  let status = 0;
  let body = "";
  const response = {
    set statusCode(value: number) {
      status = value;
    },
    get statusCode() {
      return status;
    },
    setHeader() {},
    end(text: string) {
      body = text;
    },
  } as unknown as ServerResponse;

  await handler({} as IncomingMessage, response);

  return {
    status,
    transcription: (JSON.parse(body) as { transcription: Transcription }).transcription,
  };
}

const saved = {
  VERBAL_ASR: process.env.VERBAL_ASR,
  VERBAL_WHISPER_BIN: process.env.VERBAL_WHISPER_BIN,
  VERBAL_WHISPER_MODEL: process.env.VERBAL_WHISPER_MODEL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  PATH: process.env.PATH,
};

let emptyData = "";

beforeEach(async () => {
  emptyData = await mkdtemp(path.join(tmpdir(), "verbal-system-"));
  process.env.XDG_DATA_HOME = emptyData;
});

afterAll(async () => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
  await rm(emptyData, { recursive: true, force: true });
});

describe("GET /api/system", () => {
  it("reports the cloud provider in cloud mode", async () => {
    process.env.VERBAL_ASR = "cloud";

    const result = await callHandler();

    expect(result.status).toBe(200);
    expect(result.transcription).toEqual({
      mode: "cloud",
      label: "Cloud (OpenAI-compatible)",
      cloud: true,
    });
  });

  it("reports a missing engine with an install hint", async () => {
    process.env.VERBAL_ASR = "local";
    process.env.VERBAL_WHISPER_BIN = "/no/such/whisper-cli";
    process.env.VERBAL_WHISPER_MODEL = "/no/such/model.bin";
    process.env.PATH = "";

    const result = await callHandler();

    expect(result.transcription).toEqual({
      mode: "none",
      label: "No speech engine",
      cloud: false,
      hint: "Install whisper (see README, Transcription setup), run npm run fetch:typhoon, or set OPENAI_API_KEY.",
    });
  });
});
