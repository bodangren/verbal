// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Home from "../pages/index";

const ROOT = "/projects/demo";
const MISSING_BUNDLER = "Cannot find package '@remotion/bundler' in tools/remotion";

function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function project() {
  return { schemaVersion: 1, id: "p1", name: "Demo", media: { assetPath: "take.mp4" } };
}

function transcript() {
  return {
    schemaVersion: 1,
    words: [{ id: "w0", text: "hello", start: 0, end: 0.9 }],
    segments: [],
    removedWordIds: [],
  };
}

function storyboard() {
  return {
    schemaVersion: 1,
    scenes: [
      {
        id: "s1",
        anchor: { startWordId: "w0", endWordId: "w0" },
        visual: "talk",
        layer: "full-frame",
      },
    ],
  };
}

function preview() {
  return {
    tier: "fast",
    version: 1,
    storyboardHash: "abc",
    scenes: [{ sceneId: "s1", visual: "talk", startSeconds: 0, endSeconds: 1, source: "talk" }],
  };
}

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "export-1",
    kind: "export",
    status: "running",
    createdAt: "2026-11-24T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
    progress: 0.42,
    message: "Rendering step 1 of 6",
    result: null,
    error: null,
    ...overrides,
  };
}

describe("Export flow names and busy state", () => {
  let current: Record<string, unknown>;

  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    current = job();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
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
                  transcriptWords: 1,
                  hasMedia: true,
                  createdAt: new Date().toISOString(),
                  durationSeconds: 1,
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
        if (url.startsWith("/api/transcript")) {
          return reply(transcript());
        }
        if (url.startsWith("/api/storyboard/export")) {
          return reply(job({ status: "queued", progress: 0, message: null }));
        }
        if (url.startsWith("/api/storyboard/preview")) {
          return reply(preview());
        }
        if (url.startsWith("/api/storyboard")) {
          return reply(storyboard());
        }
        if (url.startsWith("/api/jobs/")) {
          return reply(current);
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
          return reply({ durationSeconds: 1, sizeBytes: 1024, streams: [{ kind: "video" }] });
        }

        return reply({});
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  async function openProject() {
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit" })).toBeTruthy());
  }

  async function openExport() {
    await openProject();
    fireEvent.click(modeTab("Export"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Export", level: 2 })).toBeTruthy(),
    );
  }

  function modeTab(name: string): HTMLElement {
    return within(screen.getByRole("navigation", { name: "Workspace mode" })).getByRole(
      "button",
      { name },
    );
  }

  it("names the mode tab Export and no visible text says Deliver", async () => {
    await openProject();

    expect(modeTab("Export")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Deliver" })).toBeNull();

    fireEvent.click(modeTab("Export"));
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Export", level: 2 })).toBeTruthy(),
    );
    expect(document.body.textContent).not.toContain("Deliver");
  });

  it("titles the stage Export and the panel button Export Video", async () => {
    await openExport();

    expect(screen.getByRole("button", { name: "Export Video" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Export Storyboard" })).toBeNull();
    expect(document.body.textContent).not.toContain("Export Storyboard");
  });

  it("has no Save button in Edit and no save clause in the source", async () => {
    await openProject();

    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();

    const source = readFileSync("apps/web/pages/index.tsx", "utf8");
    expect(source).not.toContain("Save the transcript to keep it");
  });

  it("disables Export and Preview with a labelled progress while a job runs", async () => {
    await openExport();
    fireEvent.click(screen.getByRole("button", { name: "Export Video" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Exporting…" })).toBeTruthy());
    const exportButton = screen.getByRole("button", { name: "Exporting…" }) as HTMLButtonElement;
    const previewButton = screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    expect(previewButton.disabled).toBe(true);

    const bar = screen.getByRole("progressbar", { name: "Export progress" }) as HTMLProgressElement;
    expect(bar.value).toBe(42);

    const panel = document.getElementById("export-panel") as HTMLElement;
    expect(within(panel).queryByText(/Job running/)).toBeNull();

    current = job({ status: "done", progress: 1, message: null });
    await waitFor(() => expect(screen.getByRole("button", { name: "Export Video" })).toBeTruthy());
  });

  it("sends the start and done texts to the one status region", async () => {
    await openExport();
    fireEvent.click(screen.getByRole("button", { name: "Export Video" }));

    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Export started"));

    current = job({ status: "done", progress: 1, message: null, result: null });
    await waitFor(
      () => expect(screen.getByRole("status").textContent).toBe("Export finished"),
      { timeout: 3000 },
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("keeps the output path in the done text and the export panel", async () => {
    await openExport();
    fireEvent.click(screen.getByRole("button", { name: "Export Video" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Exporting…" })).toBeTruthy());

    current = job({
      status: "done",
      progress: 1,
      message: null,
      result: { outputPath: "/projects/demo/exports/Demo.mp4" },
    });
    await waitFor(
      () => expect(screen.getByRole("status").textContent).toContain("/projects/demo/exports/Demo.mp4"),
      { timeout: 3000 },
    );

    const panel = document.getElementById("export-panel") as HTMLElement;
    expect(within(panel).getByText(/\/projects\/demo\/exports\/Demo\.mp4/)).toBeTruthy();
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("sends the failure text to the one status region", async () => {
    await openExport();
    current = job({
      status: "failed",
      progress: 0.42,
      message: "Rendering step 1 of 6",
      error: MISSING_BUNDLER,
    });
    fireEvent.click(screen.getByRole("button", { name: "Export Video" }));

    await waitFor(
      () => expect(screen.getByRole("status").textContent).toMatch(/npm install in tools\/remotion/),
      { timeout: 3000 },
    );
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});
