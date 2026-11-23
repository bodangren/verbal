// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(cleanup);

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
});
