// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { ProjectBrowser } from "./ProjectBrowser";
import type { FsEntry } from "../server/fs-api";

const entries: FsEntry[] = [
  {
    name: "alpha",
    path: "/home/me/alpha",
    isProject: true,
    kind: "directory",
    summary: {
      name: "Alpha",
      transcriptWords: 12,
      hasMedia: true,
      createdAt: "2026-11-22T00:00:00.000Z",
      durationSeconds: 26.4,
    },
  },
];

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

function setup(overrides: Partial<Parameters<typeof ProjectBrowser>[0]> = {}) {
  const props = {
    path: "/home/me",
    parent: "/home",
    entries,
    currentRoot: "/home/me/alpha",
    onCreate: vi.fn(),
    onHome: vi.fn(),
    onNavigate: vi.fn(),
    onOpen: vi.fn(),
    onUp: vi.fn(),
    ...overrides,
  };

  const view = render(<ProjectBrowser {...props} />);
  return { ...props, ...view };
}

describe("ProjectBrowser", () => {
  it("marks the open project row as current", () => {
    const { container } = setup();

    expect(container.querySelector('[aria-current="true"]')).not.toBeNull();
  });

  it("collapses to a rail and remembers it", () => {
    const { container } = setup();

    fireEvent.click(screen.getByRole("button", { name: "Collapse Project Browser" }));

    expect(window.localStorage.getItem("verbal.browser.collapsed")).toBe("true");
    expect(container.querySelector(".browser--collapsed")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand Project Browser" }));

    expect(window.localStorage.getItem("verbal.browser.collapsed")).toBe("false");
    expect(container.querySelector(".browser--collapsed")).toBeNull();
  });

  it("renders expanded on the server pass on narrow screens", () => {
    mockMatchMedia(true);
    window.localStorage.setItem("verbal.browser.collapsed", "true");

    const html = renderToString(
      <ProjectBrowser
        path="/home/me"
        parent="/home"
        entries={entries}
        currentRoot="/home/me/alpha"
        onCreate={vi.fn()}
        onHome={vi.fn()}
        onNavigate={vi.fn()}
        onOpen={vi.fn()}
        onUp={vi.fn()}
      />,
    );

    expect(html).not.toContain("browser--collapsed");
    expect(html).toContain("Collapse Project Browser");
  });

  it("stays open while no project is open on narrow screens", () => {
    mockMatchMedia(true);

    const { container } = setup({ currentRoot: "" });

    expect(container.querySelector(".browser--collapsed")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Collapse Project Browser" }),
    ).toBeTruthy();
  });

  it("hydrates the server markup without a mismatch on narrow screens", async () => {
    const props = {
      path: "/home/me",
      parent: "/home",
      entries,
      currentRoot: "/home/me/alpha",
      onCreate: vi.fn(),
      onHome: vi.fn(),
      onNavigate: vi.fn(),
      onOpen: vi.fn(),
      onUp: vi.fn(),
    };

    window.matchMedia = savedMatchMedia;
    const html = renderToString(<ProjectBrowser {...props} />);

    mockMatchMedia(true);
    const seen: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((...args: unknown[]) => {
        seen.push(String(args[0]));
      });
    const host = document.createElement("div");
    document.body.appendChild(host);
    host.innerHTML = html;
    try {
      let root: ReturnType<typeof hydrateRoot> | null = null;
      await act(async () => {
        root = hydrateRoot(host, <ProjectBrowser {...props} />);
      });
      const hydrationErrors = seen.filter((message) =>
        /hydrat|did not match|#418/i.test(message),
      );
      expect(hydrationErrors).toEqual([]);
      await act(async () => {
        root?.unmount();
      });
    } finally {
      spy.mockRestore();
      host.remove();
    }
  });
});
