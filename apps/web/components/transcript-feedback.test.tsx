// @vitest-environment jsdom
// Honest feedback after each edit: focus after delete, the removal message,
// the silence chip, scroll-into-view, and search keyboard control.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createTranscript } from "@verbal/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptEditor } from "./TranscriptEditor";
import Home from "../pages/index";

const ROOT = "/projects/demo";

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function project() {
  return { schemaVersion: 1, id: "p1", name: "Demo", media: { assetPath: "take.mp4" } };
}

const words = [
  { text: "hello", start: 0, end: 0.4 },
  { text: "world", start: 0.45, end: 0.9 },
  { text: "again", start: 1.8, end: 2.2 },
];

describe("TranscriptEditor feedback", () => {
  afterEach(cleanup);

  it("renders a silence chip after the word it follows", () => {
    const transcript = {
      ...createTranscript(words),
      silences: [
        { afterWordId: "w0", seconds: 1 },
        { afterWordId: "w1", seconds: 2 },
      ],
    };
    render(<TranscriptEditor transcript={transcript} />);

    const first = screen.getByText("1 s silence");
    expect(first.className).toContain("transcript__silence");
    expect(first.getAttribute("aria-label")).toBe("1 second of silence");
    expect(screen.getByRole("option", { name: "hello" }).nextElementSibling).toBe(first);

    const second = screen.getByText("2 s silence");
    expect(second.getAttribute("aria-label")).toBe("2 seconds of silence");
    expect(screen.getByRole("option", { name: "world" }).nextElementSibling).toBe(second);
    expect(screen.getByRole("option", { name: "again" }).nextElementSibling).toBeNull();
  });

  describe("scroll-into-view", () => {
    let original: typeof Element.prototype.scrollIntoView;

    beforeEach(() => {
      original = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = vi.fn();
    });

    afterEach(() => {
      Element.prototype.scrollIntoView = original;
      cleanup();
    });

    it("calls scrollIntoView with block nearest when a word is selected", () => {
      render(<TranscriptEditor transcript={createTranscript(words)} />);

      fireEvent.click(screen.getByRole("option", { name: "world" }));

      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    });
  });
});

describe("Home edit feedback", () => {
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

  it("moves the caret to the next kept word and reports the removal", async () => {
    await openEdit();
    selectRange("w1", "w2");
    const listbox = screen.getByRole("listbox", { name: "Transcript" });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "Delete" });

    expect(isRemoved("w1")).toBe(true);
    expect(isRemoved("w2")).toBe(true);
    expect(listbox.getAttribute("aria-activedescendant")).toBe("transcript-word-w3");
    expect(screen.getByRole("status").textContent).toContain("Removed 2 words");
  });

  it("reports a single removed word", async () => {
    await openEdit();
    fireEvent.click(word("w1"));
    const listbox = screen.getByRole("listbox", { name: "Transcript" });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "Delete" });

    expect(isRemoved("w1")).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Removed 1 word");
  });

  it("falls back to the previous kept word when none follows", async () => {
    await openEdit();
    selectRange("w4", "w5");
    const listbox = screen.getByRole("listbox", { name: "Transcript" });
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "Delete" });

    expect(listbox.getAttribute("aria-activedescendant")).toBe("transcript-word-w3");
  });

  it("selects match 1 on input and moves with Enter, Shift+Enter, and Next", async () => {
    texts = ["alpha", "echo", "bravo", "echo", "charlie", "echo"];
    await openEdit();
    const find = screen.getByPlaceholderText("Find in Transcript…");

    fireEvent.change(find, { target: { value: "echo" } });
    expect(screen.getByText("1 of 3")).toBeTruthy();
    expect(word("w1").dataset.selected).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Next match" }));
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(word("w3").dataset.selected).toBe("true");

    fireEvent.keyDown(find, { key: "Enter" });
    expect(screen.getByText("3 of 3")).toBeTruthy();
    expect(word("w5").dataset.selected).toBe("true");

    fireEvent.keyDown(find, { key: "Enter", shiftKey: true });
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(word("w3").dataset.selected).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Previous match" }));
    expect(screen.getByText("1 of 3")).toBeTruthy();
    expect(word("w1").dataset.selected).toBe("true");
  });
});
