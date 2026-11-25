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

function job(status: "queued" | "done", result: unknown = null) {
  return {
    id: "export-1",
    kind: "export",
    status,
    createdAt: "2026-11-24T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
    progress: status === "done" ? 1 : 0,
    message: null,
    result,
    error: null,
  };
}

describe("Deliver export cards", () => {
  let exportBody: Record<string, unknown> | null;

  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    exportBody = null;

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
          exportBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
          return reply(job("queued"));
        }
        if (url.startsWith("/api/storyboard/preview")) {
          return reply({
            tier: "fast",
            version: 1,
            storyboardHash: "abc",
            scenes: [
              { sceneId: "s1", visual: "talk", startSeconds: 0, endSeconds: 1, source: "talk" },
            ],
          });
        }
        if (url.startsWith("/api/storyboard")) {
          return reply(storyboard());
        }
        if (url.startsWith("/api/jobs/")) {
          return reply(job("done", { outputPath: "/exports/Demo.mp4" }));
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
            durationSeconds: 1,
            sizeBytes: 1024,
            streams: [{ kind: "video" }],
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

  async function openDeliver() {
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Open" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Edit" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Storyboard" })).toBeTruthy());
  }

  it("defaults the title to the project name and leaves other cards empty", async () => {
    await openDeliver();

    const checkbox = screen.getByRole("checkbox", {
      name: "Add Title And Outro Cards",
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    const title = screen.getByLabelText("Title") as HTMLInputElement;
    const outro = screen.getByLabelText("Outro") as HTMLInputElement;
    const contact = screen.getByLabelText("Contact") as HTMLInputElement;
    expect(title.value).toBe("Demo");
    expect(outro.value).toBe("");
    expect(contact.value).toBe("");
  });

  it("hides the card fields and omits brand bookends when the switch is off", async () => {
    await openDeliver();

    fireEvent.click(screen.getByRole("checkbox", { name: "Add Title And Outro Cards" }));

    expect(screen.queryByLabelText("Title")).toBeNull();
    expect(screen.queryByLabelText("Outro")).toBeNull();
    expect(screen.queryByLabelText("Contact")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Export Storyboard" }));
    await waitFor(() => expect(exportBody).not.toBeNull());
    expect(exportBody?.includeBrand).toBe(false);
  });

  it("disables export with a clear reason when the title is empty", async () => {
    await openDeliver();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "" } });

    const button = screen.getByRole("button", { name: "Export Storyboard" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Enter a title for the title card.")).toBeTruthy();
  });
});
