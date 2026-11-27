// @vitest-environment jsdom
// The Edit player folds by default on a short or narrow viewport, and the
// structural edit toolbar sticks to the bottom of the stage.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Acceptance } from "@verbal/cleanup";
import type { ProjectDocument } from "@verbal/core/browser";
import { EditWorkspace, useToolbarHeightVariable } from "./EditWorkspace";
import { JobProvider } from "../hooks/use-job";
import type { TranscriptDocumentController } from "../hooks/use-transcript-document";

const css = readFileSync(join(__dirname, "..", "styles", "globals.css"), "utf8");

function mockMatchMedia(matches: boolean) {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const savedMatchMedia = window.matchMedia;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.matchMedia = savedMatchMedia;
});

const editing: TranscriptDocumentController = {
  document: null,
  dirty: false,
  canUndo: false,
  canRedo: false,
  removeRange: () => undefined,
  removeRanges: () => undefined,
  restore: () => undefined,
  insertSilence: () => undefined,
  splitSegment: () => undefined,
  moveRange: () => undefined,
  undo: () => undefined,
  redo: () => undefined,
  markSaved: () => undefined,
  reset: () => undefined,
};

const project: ProjectDocument = {
  schemaVersion: 1,
  id: "p1",
  name: "Demo",
  createdAt: "2026-11-28T00:00:00.000Z",
  media: { assetPath: "take.mp4" },
};

const acceptance: Acceptance = { categories: [], ids: [], aggressiveness: 0.5 };

function renderWorkspace() {
  return render(
    <JobProvider>
      <EditWorkspace
        active
        root="/projects/demo"
        project={project}
        transcript={null}
        selection={null}
        setSelection={() => undefined}
        editing={editing}
        proposals={[]}
        acceptance={acceptance}
        setProposals={() => undefined}
        setAcceptance={() => undefined}
        setMessage={() => undefined}
        guard={async (run) => run()}
        paneError={null}
        onDismissPaneError={() => undefined}
        onTranscribe={() => undefined}
        onGoToIngest={() => undefined}
      />
    </JobProvider>,
  );
}

describe("EditWorkspace player collapse", () => {
  it("collapses the player by default on a short or narrow viewport", () => {
    mockMatchMedia(true);
    const { container } = renderWorkspace();

    expect(container.querySelector(".playback--collapsed")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Expand Player" })).toBeTruthy();
  });

  it("keeps the player expanded by default on a roomy viewport", () => {
    mockMatchMedia(false);
    const { container } = renderWorkspace();

    expect(container.querySelector(".playback--collapsed")).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse Player" })).toBeTruthy();
  });

  it("lets the user's toggle override the default", () => {
    mockMatchMedia(true);
    const { container } = renderWorkspace();
    expect(container.querySelector(".playback--collapsed")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand Player" }));

    expect(container.querySelector(".playback--collapsed")).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse Player" })).toBeTruthy();
  });
});

describe("edit toolbar footer CSS", () => {
  it("sticks the footer toolbar to the bottom of the stage", () => {
    const rule = css.match(/\.toolbar--footer\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("position: sticky");
    expect(rule?.[0]).toContain("bottom: 0");
  });
});

describe("EditWorkspace player collapse persistence", () => {
  it("writes the explicit toggle to localStorage", () => {
    mockMatchMedia(false);
    const { container } = renderWorkspace();
    expect(container.querySelector(".playback--collapsed")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Player" }));

    expect(window.localStorage.getItem("verbal.player.collapsed")).toBe("true");
    expect(container.querySelector(".playback--collapsed")).not.toBeNull();
  });

  it("reads the stored choice on a fresh mount", () => {
    window.localStorage.setItem("verbal.player.collapsed", "true");
    mockMatchMedia(false);

    const { container } = renderWorkspace();

    expect(container.querySelector(".playback--collapsed")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Expand Player" })).toBeTruthy();
  });

  it("lets the explicit choice beat the viewport default", () => {
    window.localStorage.setItem("verbal.player.collapsed", "false");
    mockMatchMedia(true);

    const { container } = renderWorkspace();

    expect(container.querySelector(".playback--collapsed")).toBeNull();
    expect(screen.getByRole("button", { name: "Collapse Player" })).toBeTruthy();
  });

  it("falls back to an in-memory override when storage fails", () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    mockMatchMedia(true);
    const first = renderWorkspace();
    expect(first.container.querySelector(".playback--collapsed")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand Player" }));
    expect(first.container.querySelector(".playback--collapsed")).toBeNull();

    first.unmount();
    const second = renderWorkspace();
    expect(second.container.querySelector(".playback--collapsed")).toBeNull();

    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe("useToolbarHeightVariable", () => {
  it("publishes the toolbar's measured height and follows its resizes", () => {
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar--footer";
    let height = 200;
    Object.defineProperty(toolbar, "offsetHeight", { get: () => height });
    document.body.append(toolbar);

    let notify: () => void = () => undefined;
    const disconnect = vi.fn();
    const saved = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) {
        notify = callback;
      }
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    } as unknown as typeof ResizeObserver;

    const root = document.documentElement;
    const { unmount } = renderHook(() => useToolbarHeightVariable(true, true));
    expect(root.style.getPropertyValue("--edit-toolbar-height")).toBe("208px");

    height = 240;
    notify();
    expect(root.style.getPropertyValue("--edit-toolbar-height")).toBe("248px");

    unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(root.style.getPropertyValue("--edit-toolbar-height")).toBe("");

    globalThis.ResizeObserver = saved;
    toolbar.remove();
  });

  it("sets the height when the toolbar mounts after the first effect run", () => {
    const saved = globalThis.ResizeObserver;
    const disconnect = vi.fn();
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect = disconnect;
    } as unknown as typeof ResizeObserver;

    const root = document.documentElement;
    const { rerender } = renderHook(
      ({ hasTranscript }) => useToolbarHeightVariable(true, hasTranscript),
      { initialProps: { hasTranscript: false } },
    );
    expect(root.style.getPropertyValue("--edit-toolbar-height")).toBe("");

    // The footer toolbar mounts later, once the transcript appears.
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar--footer";
    Object.defineProperty(toolbar, "offsetHeight", { get: () => 150 });
    document.body.append(toolbar);

    rerender({ hasTranscript: true });
    expect(root.style.getPropertyValue("--edit-toolbar-height")).toBe("158px");

    globalThis.ResizeObserver = saved;
    toolbar.remove();
  });

  it("does nothing while the workspace is inactive", () => {
    renderHook(() => useToolbarHeightVariable(false, true));
    expect(document.documentElement.style.getPropertyValue("--edit-toolbar-height")).toBe("");
  });
});
