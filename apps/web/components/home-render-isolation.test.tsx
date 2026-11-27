// @vitest-environment jsdom
// A prompter tick (100 ms) must re-render only the Studio subtree, never Home.
// This mounts the real page, opens the Studio, starts the prompter, and counts
// Home renders while the clock advances.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createTranscript } from "@verbal/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home, { __homeRenderCounter } from "../pages/index";

const ROOT = "/projects/demo";

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

describe("Home render isolation", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    __homeRenderCounter?.reset();

    // The Studio open effect defers the camera start by one frame; the camera
    // is absent in jsdom, so a no-op frame keeps the test free of media APIs.
    vi.stubGlobal("requestAnimationFrame", () => 0);

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
            createdAt: "2026-11-27T00:00:00.000Z",
          });
        }
        if (url.startsWith("/api/transcript") && method === "PUT") {
          return reply(JSON.parse(String(init?.body)));
        }
        if (url.startsWith("/api/transcript")) {
          return reply(
            createTranscript([
              { text: "hello", start: 0, end: 0.4 },
              { text: "world", start: 0.5, end: 0.9 },
            ]),
          );
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

        return reply({});
      }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    cleanup();
  });

  it("advancing the prompter 20 ticks renders Home zero additional times", async () => {
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Ingest" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Studio" })).toBeTruthy());

    // The clock interval is created when Play is pressed; fake it from here on.
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    // Settle any queued state so the measurement below is the steady count.
    await act(async () => {});

    const counter = __homeRenderCounter;
    expect(counter).toBeDefined();
    const before = counter!.count;

    act(() => {
      vi.advanceTimersByTime(20 * 100);
    });

    expect(counter!.count).toBe(before);
  });
});
