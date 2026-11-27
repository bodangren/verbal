// @vitest-environment jsdom
// The Restore action revives removed words. The toolbar button appears beside
// Delete and is enabled only when the selection contains a removed word.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createTranscript } from "@verbal/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../pages/index";

const ROOT = "/projects/demo";

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function project() {
  return { schemaVersion: 1, id: "p1", name: "Demo", media: { assetPath: "take.mp4" } };
}

describe("Restore action", () => {
  let texts: string[];

  function transcript() {
    return createTranscript(texts.map((text, index) => ({ text, start: index, end: index + 0.4 })));
  }

  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    texts = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? "GET";

        if (url.startsWith("/api/fs/list")) {
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
                  transcriptWords: texts.length,
                  hasMedia: true,
                  createdAt: new Date().toISOString(),
                  durationSeconds: 60,
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
          const body = JSON.parse(String(init?.body)) as { document: unknown };
          return reply(body.document);
        }
        if (url.startsWith("/api/transcript")) {
          return reply(transcript());
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
        if (url.startsWith("/api/media/probe")) {
          return reply({
            durationSeconds: 60,
            sizeBytes: 1024,
            streams: [{ kind: "video" }],
          });
        }
        if (url.startsWith("/api/jobs/")) {
          return reply({
            id: "job-1",
            kind: "transcribe",
            status: "done",
            createdAt: "2026-11-24T00:00:00.000Z",
            updatedAt: "2026-11-24T00:00:00.000Z",
            progress: 1,
            message: null,
            result: { words: texts.length },
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

  async function openEdit() {
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit" })).toBeTruthy());
    await waitFor(() =>
      expect(
        Array.from(document.querySelectorAll<HTMLElement>('[role="option"][data-word-id]')).map(
          (button) => button.dataset.wordId,
        ),
      ).toEqual(texts.map((_text, index) => `w${index}`)),
    );
  }

  function word(id: string): HTMLElement {
    const option = Array.from(
      document.querySelectorAll<HTMLElement>('[role="option"][data-word-id]'),
    ).find((item) => item.dataset.wordId === id);
    if (option === undefined) {
      throw new Error(`missing word ${id}`);
    }
    return option;
  }

  function isRemoved(id: string): boolean {
    return word(id).dataset.removed === "true";
  }

  function selectRange(from: string, to: string) {
    fireEvent.click(word(from));
    fireEvent.click(word(to), { shiftKey: true });
  }

  it("enables the Restore button only for a selection with removed words", async () => {
    await openEdit();
    selectRange("w1", "w2");

    expect(
      (screen.getByRole("button", { name: "Restore" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(isRemoved("w1")).toBe(true);
    expect(isRemoved("w2")).toBe(true);

    selectRange("w1", "w2");
    expect(word("w1").getAttribute("aria-disabled")).toBe("true");

    const restore = screen.getByRole("button", { name: "Restore" }) as HTMLButtonElement;
    expect(restore.disabled).toBe(false);
    expect(restore.getAttribute("title")).toContain("Space");

    fireEvent.click(restore);
    expect(isRemoved("w1")).toBe(false);
    expect(isRemoved("w2")).toBe(false);
  });

  it("restores a deleted range, and one undo removes it again", async () => {
    await openEdit();
    selectRange("w1", "w2");
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    selectRange("w1", "w2");

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(isRemoved("w1")).toBe(false);
    expect(isRemoved("w2")).toBe(false);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(isRemoved("w1")).toBe(true);
    expect(isRemoved("w2")).toBe(true);
  });
});
