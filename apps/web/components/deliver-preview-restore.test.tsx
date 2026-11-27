// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../pages/index";

const ROOT = "/projects/demo";

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

const SCENE = {
  id: "t1",
  anchor: { startWordId: "w0", endWordId: "w2" },
  visual: "talk",
  layer: "full-frame",
};

const PLAN = {
  tier: "fast",
  version: 1,
  storyboardHash: "abc",
  scenes: [
    {
      sceneId: "t1",
      visual: "talk",
      startSeconds: 0,
      endSeconds: 58,
      playSeconds: 53.4,
      source: "talk",
    },
  ],
};

describe("Export preview after a reload", () => {
  let scenes: unknown[];
  let previewBodies: { tier?: string }[];

  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    scenes = [];
    previewBodies = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const url = String(input);

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
                  transcriptWords: 3,
                  hasMedia: true,
                  createdAt: new Date().toISOString(),
                  durationSeconds: 58,
                },
              },
            ],
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
        if (url.startsWith("/api/transcript")) {
          return reply({
            schemaVersion: 1,
            words: [0, 1, 2].map((index) => ({
              id: `w${index}`,
              text: `word-${index}`,
              start: index,
              end: index + 0.9,
            })),
            segments: [],
            removedWordIds: [],
          });
        }
        if (url.startsWith("/api/storyboard/preview")) {
          previewBodies.push(JSON.parse(String(init?.body)) as { tier?: string });
          return reply(PLAN);
        }
        if (url.startsWith("/api/storyboard")) {
          return reply({ schemaVersion: 1, scenes });
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

        return reply({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it("shows the scene list without a Render Preview click", async () => {
    scenes = [SCENE];
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit" })).toBeTruthy());
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Workspace mode" })).getByRole("button", {
        name: "Export",
      }),
    );

    await waitFor(() => expect(screen.getByText("Plays 53.40s")).toBeTruthy());
    expect(screen.queryByText("No Preview Yet")).toBeNull();
    // The restore uses the fast tier, which never starts a render.
    expect(previewBodies.map((body) => body.tier)).toEqual(["fast"]);
  });

  it("asks for no preview when the storyboard has no scenes", async () => {
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit" })).toBeTruthy());
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Workspace mode" })).getByRole("button", {
        name: "Export",
      }),
    );

    await waitFor(() => expect(screen.getByText("No Scenes Yet")).toBeTruthy());
    expect(previewBodies).toEqual([]);
  });
});
