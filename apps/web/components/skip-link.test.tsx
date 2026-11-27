// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createTranscript } from "@verbal/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../pages/index";

const ROOT = "/projects/demo";
const texts = ["alpha", "bravo", "charlie"];

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function project() {
  return { schemaVersion: 1, id: "p1", name: "Demo", media: { assetPath: "take.mp4" } };
}

function transcript() {
  return createTranscript(texts.map((text, index) => ({ text, start: index, end: index + 0.4 })));
}

function tabbables(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

describe("skip link to the project browser", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
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
          return reply({});
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
          return reply({ durationSeconds: 60, sizeBytes: 1024, streams: [{ kind: "video" }] });
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
  }

  it("offers a link named Skip to project browser", async () => {
    await openEdit();
    expect(screen.getByRole("link", { name: "Skip to project browser" })).toBeTruthy();
  });

  it("moves focus to the project browser when the link is activated", async () => {
    await openEdit();
    const link = screen.getByRole("link", { name: "Skip to project browser" });
    const browser = screen.getByRole("complementary", { name: "Project browser" });

    fireEvent.click(link);

    expect(document.activeElement).toBe(browser);
  });

  it("is the first tabbable element in document order", async () => {
    await openEdit();
    const link = screen.getByRole("link", { name: "Skip to project browser" });

    expect(tabbables()[0]).toBe(link);
  });

  it("reaches the transcript listbox within six tab stops from the Edit button", async () => {
    await openEdit();
    const editButton = screen.getByRole("button", { name: "Edit" });
    const listbox = screen.getByRole("listbox", { name: "Transcript" });
    const order = tabbables();
    const afterEdit = order.slice(order.indexOf(editButton) + 1);
    const stops = afterEdit.indexOf(listbox) + 1;

    expect(stops).toBeGreaterThan(0);
    expect(stops).toBeLessThanOrEqual(6);
  });

  it("hides the link off-screen until focus in the stylesheet", () => {
    const css = readFileSync(join(__dirname, "..", "styles", "globals.css"), "utf8");
    const hidden = css.match(/\.skip-link\s*\{[^}]*\}/)?.[0] ?? "";
    const visible = css.match(/\.skip-link:focus-visible\s*\{[^}]*\}/)?.[0] ?? "";

    expect(hidden).toContain("position: absolute");
    expect(hidden).toContain("left: -9999px");
    expect(visible).toContain("left: var(--space-3)");
    expect(visible).toContain("min-height: 44px");
    expect(visible).toContain("var(--");
  });
});
