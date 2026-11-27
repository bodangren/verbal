// @vitest-environment jsdom
// Shortcuts found on the current page:
// - Ctrl+Z and Cmd+Z undo, except inside a text field (index.tsx handleShortcut).
// - Ctrl+Shift+Z, Cmd+Shift+Z, Ctrl+Y and Cmd+Y redo in the same handler.
// - Delete and Backspace delete the selection on the transcript region (TranscriptEditor).
// Escape and teleprompter keys live in child components outside these edit paths.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createTranscript } from "@verbal/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../pages/index";

const ROOT = "/projects/demo";

type SavedDocument = { silences?: { afterWordId: string; seconds: number }[] };

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function project() {
  return { schemaVersion: 1, id: "p1", name: "Demo", media: { assetPath: "take.mp4" } };
}

describe("Home edit paths", () => {
  let texts: string[];
  let savedDocuments: SavedDocument[];

  function transcript() {
    return createTranscript(texts.map((text, index) => ({ text, start: index, end: index + 0.4 })));
  }

  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    texts = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"];
    savedDocuments = [];

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
          const body = JSON.parse(String(init?.body)) as { document: SavedDocument };
          savedDocuments.push(body.document);
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
    await waitFor(() => expect(wordIds()).toEqual(texts.map((_text, index) => `w${index}`)));
  }

  function wordButtons(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('[role="option"][data-word-id]'));
  }

  function wordIds(): string[] {
    return wordButtons().map((button) => button.dataset.wordId ?? "");
  }

  function word(id: string): HTMLElement {
    const option = wordButtons().find((item) => item.dataset.wordId === id);
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

  it("deletes a selected range and restores it with Ctrl+Z", async () => {
    await openEdit();
    selectRange("w1", "w2");
    expect(word("w1").dataset.selected).toBe("true");
    expect(word("w2").dataset.selected).toBe("true");

    const listbox = screen.getByRole("listbox", { name: "Transcript" });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "Delete" });

    expect(isRemoved("w1")).toBe(true);
    expect(isRemoved("w2")).toBe(true);
    expect(isRemoved("w0")).toBe(false);
    // KNOWN ISSUE F09: focus stays on the removed, disabled word in jsdom.
    expect(document.activeElement).toBe(listbox);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(isRemoved("w1")).toBe(false);
    expect(isRemoved("w2")).toBe(false);
  });

  it("moves a selected block forward and back", async () => {
    await openEdit();
    selectRange("w1", "w2");

    fireEvent.click(screen.getByRole("button", { name: "Move Forward" }));
    expect(wordIds()).toEqual(["w0", "w3", "w4", "w1", "w2", "w5"]);
    expect(word("w1").dataset.selected).toBe("true");
    expect(word("w2").dataset.selected).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Move Back" }));
    expect(wordIds()).toEqual(["w0", "w1", "w2", "w3", "w4", "w5"]);
  });

  it("inserts silence, reports it, and saves it in the document", async () => {
    await openEdit();
    fireEvent.click(word("w1"));
    fireEvent.change(screen.getByLabelText("Silence (s)"), { target: { value: "2" } });

    fireEvent.click(screen.getByRole("button", { name: "Insert Silence" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Inserted 2s of silence"),
    );

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(savedDocuments.at(-1)?.silences).toEqual([{ afterWordId: "w1", seconds: 2 }]),
    );
  });

  it("counts search matches and selects a match with Next", async () => {
    texts = ["alpha", "echo", "bravo", "echo", "charlie", "echo"];
    await openEdit();
    const find = screen.getByPlaceholderText("Find in Transcript…");

    fireEvent.change(find, { target: { value: "echo" } });
    expect(screen.getByText("1 of 3")).toBeTruthy();
    expect(word("w1").dataset.match).toBe("true");
    expect(word("w3").dataset.match).toBe("true");
    expect(word("w5").dataset.match).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByText("2 of 3")).toBeTruthy();
    // KNOWN ISSUE F09: the first Next selects match 2, not match 1.
    expect(word("w3").dataset.selected).toBe("true");
    expect(word("w1").hasAttribute("data-selected")).toBe(false);

    // KNOWN ISSUE F09: Enter in the search field does nothing.
    fireEvent.keyDown(find, { key: "Enter" });
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(word("w3").dataset.selected).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
    expect(screen.getByText("1 of 3")).toBeTruthy();
    expect(word("w1").dataset.selected).toBe("true");
  });

  it("applies every current keyboard shortcut", async () => {
    await openEdit();

    fireEvent.click(word("w1"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(isRemoved("w1")).toBe(true);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(isRemoved("w1")).toBe(false);
    fireEvent.keyDown(window, { key: "y", ctrlKey: true });
    expect(isRemoved("w1")).toBe(true);
    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    expect(isRemoved("w1")).toBe(false);
    fireEvent.keyDown(window, { key: "Z", ctrlKey: true, shiftKey: true });
    expect(isRemoved("w1")).toBe(true);
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    expect(isRemoved("w1")).toBe(false);

    fireEvent.click(word("w2"));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const find = screen.getByPlaceholderText("Find in Transcript…");
    fireEvent.keyDown(find, { key: "z", ctrlKey: true });
    expect(isRemoved("w2")).toBe(true);

    fireEvent.click(word("w3"));
    const region = screen.getByRole("listbox", { name: "Transcript" });
    region.focus();
    fireEvent.keyDown(region, { key: "Delete" });
    expect(isRemoved("w3")).toBe(true);

    fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    fireEvent.click(word("w4"));
    region.focus();
    fireEvent.keyDown(region, { key: "Backspace" });
    expect(isRemoved("w4")).toBe(true);
  });
});
