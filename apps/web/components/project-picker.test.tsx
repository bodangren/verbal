// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectSummary } from "@verbal/core/browser";
import { ProjectPicker } from "./ProjectPicker";

afterEach(cleanup);

const projects: ProjectSummary[] = [
  {
    root: "/library/alpha",
    name: "Alpha",
    hasMedia: true,
    transcriptWords: 39,
    removedWords: 0,
    createdAt: new Date().toISOString(),
  },
  {
    root: "/library/beta",
    name: "Beta",
    hasMedia: false,
    transcriptWords: 0,
    removedWords: 0,
    createdAt: "2024-01-01T00:00:00.000Z",
  },
];

function setup(overrides: Partial<Parameters<typeof ProjectPicker>[0]> = {}) {
  const props = {
    folder: "/library",
    projects,
    scanned: true,
    onFolderChange: vi.fn(),
    onScan: vi.fn(),
    onOpen: vi.fn(),
    ...overrides,
  };
  render(<ProjectPicker {...props} />);
  return props;
}

describe("ProjectPicker", () => {
  it("lists every project with its word count and media state", () => {
    setup();

    expect(screen.getByRole("region", { name: "Project picker" })).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText(/39 words · media · today/)).toBeTruthy();
    expect(screen.getByText(/0 words · no media/)).toBeTruthy();
  });

  it("opens the project whose button was pressed", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Open Beta" }));

    expect(props.onOpen).toHaveBeenCalledWith("/library/beta");
  });

  it("scans the folder, and refuses to scan an empty one", () => {
    const props = setup({ folder: "/library" });
    fireEvent.click(screen.getByRole("button", { name: "Scan folder" }));
    expect(props.onScan).toHaveBeenCalledTimes(1);

    cleanup();
    setup({ folder: "   " });
    expect(screen.getByRole("button", { name: "Scan folder" })).toHaveProperty("disabled", true);
  });

  it("marks a running scan instead of allowing a second one", () => {
    setup({ scanning: true });

    const button = screen.getByRole("button", { name: "Scanning…" });
    expect(button).toHaveProperty("disabled", true);
  });

  it("distinguishes an unscanned folder from an empty one", () => {
    setup({ projects: [], scanned: false });
    expect(screen.getByText(/Point at a folder/)).toBeTruthy();

    cleanup();
    setup({ projects: [], scanned: true });
    expect(screen.getByText(/No projects in that folder/)).toBeTruthy();
  });

  it("reports a scan failure", () => {
    setup({ projects: [], scanned: true, error: "that folder does not exist" });

    expect(screen.getByText("that folder does not exist")).toBeTruthy();
  });
});
