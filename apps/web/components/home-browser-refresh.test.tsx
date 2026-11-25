// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../pages/index";

const ROOT = "/projects/demo";

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function project() {
  return { schemaVersion: 1, id: "p1", name: "Demo", media: { assetPath: "take.mp4" } };
}

function transcript(words: number) {
  return {
    schemaVersion: 1,
    words: Array.from({ length: words }, (_, index) => ({
      id: `w${index}`,
      text: `word-${index}`,
      start: index,
      end: index + 0.9,
    })),
    segments: [],
    removedWordIds: [],
  };
}

describe("Home browser summaries", () => {
  let lists: number;
  let words: number;
  let hasMedia: boolean;

  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    lists = 0;
    words = 0;
    hasMedia = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.startsWith("/api/fs/list")) {
          lists += 1;
          if (url.includes("includeFiles=1")) {
            return reply({
              path: "/projects",
              parent: null,
              entries: [
                {
                  name: "sample.mp4",
                  path: "/projects/sample.mp4",
                  isProject: false,
                  kind: "file",
                  isMedia: true,
                },
              ],
            });
          }
          return reply({
            path: "/projects",
            parent: null,
            entries: [
              {
                name: "Demo",
                path: ROOT,
                isProject: true,
                kind: "directory",
                summary: {
                  name: "Demo",
                  transcriptWords: words,
                  hasMedia,
                  createdAt: new Date().toISOString(),
                  durationSeconds: words > 0 ? 58 : 0,
                },
              },
            ],
          });
        }

        if (url.startsWith("/api/system")) {
          return reply({ transcription: { label: "Test", cloud: false } });
        }
        if (url.startsWith("/api/projects")) {
          return reply(project());
        }
        if (url.startsWith("/api/transcript") && method === "PUT") {
          const body = JSON.parse(String(init?.body)) as { document: { words: unknown[] } };
          words = body.document.words.length;
          return reply(body.document);
        }
        if (url.startsWith("/api/transcript")) {
          return reply(transcript(words));
        }
        if (url.startsWith("/api/storyboard")) {
          return reply({ schemaVersion: 1, scenes: [] });
        }
        if (url.startsWith("/api/script")) {
          return reply({ script: "" });
        }
        if (url.startsWith("/api/takes")) {
          return reply({ takes: [] });
        }
        if (url.startsWith("/api/cleanup")) {
          return reply({ proposals: [] });
        }
        if (url.startsWith("/api/media/import")) {
          hasMedia = true;
          return reply({ project: project() });
        }
        if (url.startsWith("/api/transcribe")) {
          return reply({
            id: "job-1",
            kind: "transcribe",
            status: "queued",
            createdAt: "2026-11-24T00:00:00.000Z",
            updatedAt: "2026-11-24T00:00:00.000Z",
            progress: 0,
            message: null,
            result: null,
            error: null,
          });
        }
        if (url.startsWith("/api/jobs/")) {
          words = 1;
          return reply({
            id: "job-1",
            kind: "transcribe",
            status: "done",
            createdAt: "2026-11-24T00:00:00.000Z",
            updatedAt: "2026-11-24T00:00:00.000Z",
            progress: 1,
            message: "saving transcript",
            result: { words: 1 },
            error: null,
          });
        }

        return reply({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("clears a finished job's words when the mode changes", async () => {
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/No transcript.*No media/)).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Ingest" }));
    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    await waitFor(() => expect(screen.getByText("Transcribed 1 words")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Storyboard" })).toBeTruthy());
    expect(screen.queryByText(/Job done/)).toBeNull();
  });

  it("refreshes the browsed listing after open, import, transcription and save", async () => {
    render(<Home />);
    await waitFor(() => expect(screen.getByText(/No transcript.*No media/)).toBeTruthy());
    const afterMount = lists;

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(lists).toBeGreaterThan(afterMount));
    const afterOpen = lists;

    fireEvent.click(screen.getByRole("button", { name: "Ingest" }));
    fireEvent.click(screen.getByRole("button", { name: "Import Media" }));
    await waitFor(() => expect(screen.getByTitle("Import sample.mp4")).toBeTruthy());
    fireEvent.click(screen.getByTitle("Import sample.mp4"));
    await waitFor(() => expect(lists).toBeGreaterThan(afterOpen));
    await waitFor(() => expect(screen.getByText(/No transcript.*Media/)).toBeTruthy());
    const afterImport = lists;

    fireEvent.click(screen.getByRole("button", { name: "Transcribe" }));
    await waitFor(() => expect(lists).toBeGreaterThan(afterImport));
    await waitFor(() => expect(screen.getByText(/1 word.*Media/)).toBeTruthy());
    const afterTranscribe = lists;

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(lists).toBeGreaterThan(afterTranscribe));
  });
});
