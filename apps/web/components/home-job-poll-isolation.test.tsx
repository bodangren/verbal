// @vitest-environment jsdom
// A job poll tick (500 ms) must re-render only the components that consume the
// job, never Home. This mounts the real page, starts a transcription that keeps
// polling a running job, and counts Home renders while the poll advances.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createTranscript } from "@verbal/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home, { __homeRenderCounter } from "../pages/index";

const ROOT = "/projects/demo";

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function runningJob() {
  return {
    id: "job-1",
    kind: "transcribe",
    status: "running",
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
    progress: 0.5,
    message: null,
    result: null,
    error: null,
  };
}

describe("Home job-poll render isolation", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    __homeRenderCounter?.reset();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.startsWith("/api/fs/list")) {
          return reply({
            path: "/projects",
            parent: null,
            entries: [{ name: "Demo", path: ROOT, isProject: true, kind: "directory" }],
          });
        }
        if (url.startsWith("/api/system")) {
          return reply({ transcription: { label: "Test", cloud: false } });
        }
        if (url.startsWith("/api/projects")) {
          return reply({
            schemaVersion: 1,
            id: "p1",
            name: "Demo",
            media: { assetPath: "take.mp4" },
          });
        }
        if (url.startsWith("/api/transcript") && method === "PUT") {
          return reply(JSON.parse(String(init?.body)));
        }
        if (url.startsWith("/api/transcript")) {
          return reply(createTranscript([]));
        }
        if (url.startsWith("/api/storyboard")) {
          return reply({ schemaVersion: 1, scenes: [] });
        }
        if (url.startsWith("/api/script")) {
          return reply({ script: "Hello world." });
        }
        if (url.startsWith("/api/takes")) {
          return reply({ takes: [] });
        }
        if (url.startsWith("/api/cleanup")) {
          return reply({ proposals: [] });
        }
        if (url.startsWith("/api/media/probe")) {
          return reply({
            durationSeconds: 1,
            sizeBytes: 1024,
            streams: [{ kind: "video" }],
          });
        }
        if (url.startsWith("/api/transcribe")) {
          return reply(runningJob());
        }
        if (url.startsWith("/api/jobs/")) {
          return reply(runningJob());
        }

        return reply({});
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("advancing a job poll tick renders Home zero additional times", async () => {
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Ingest" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Transcribe" })).toBeTruthy());

    // The poll sleeps 500 ms between fetches; fake the clock from here on.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));

    // Flush the transcription fetch and the first job fetch, reaching the sleep.
    for (let i = 0; i < 10; i += 1) {
      await act(async () => {});
    }

    const counter = __homeRenderCounter;
    expect(counter).toBeDefined();
    const before = counter!.count;

    act(() => {
      vi.advanceTimersByTime(500);
    });
    await act(async () => {});

    expect(counter!.count).toBe(before);
  });
});
