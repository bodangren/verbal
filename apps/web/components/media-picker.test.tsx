// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FsEntry } from "../server/fs-api";
import { MediaPicker, type MediaPickerProps } from "./MediaPicker";

const entries: FsEntry[] = [
  { name: "media", path: "/home/me/media", isProject: false, kind: "directory" },
  {
    name: "take.mp4",
    path: "/home/me/media/take.mp4",
    isProject: false,
    kind: "file",
    isMedia: true,
  },
];

afterEach(cleanup);

function setup(overrides: Partial<MediaPickerProps> = {}) {
  const props: MediaPickerProps = {
    path: "/home/me",
    parent: "/home",
    entries,
    onChoose: vi.fn(),
    onClose: vi.fn(),
    onHome: vi.fn(),
    onNavigate: vi.fn(),
    onUp: vi.fn(),
    ...overrides,
  };

  render(<MediaPicker {...props} />);
  return props;
}

describe("MediaPicker", () => {
  it("chooses a media file and enters a folder", () => {
    const props = setup();

    fireEvent.click(screen.getByTitle("Import take.mp4"));
    expect(props.onChoose).toHaveBeenCalledWith("/home/me/media/take.mp4");

    fireEvent.click(screen.getByTitle("Enter media"));
    expect(props.onNavigate).toHaveBeenCalledWith("/home/me/media");
  });

  it("closes on Escape", () => {
    const props = setup();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("offers a next step when a folder fails to open", () => {
    setup({ error: "no folder at /tmp/gone", entries: [] });

    expect(screen.getByRole("alert").textContent).toContain("no folder");
    expect(screen.getByText("Use Home or Up to keep browsing.")).toBeTruthy();
  });

  it("shows an empty state when the folder has no media", () => {
    setup({ entries: [] });

    expect(screen.getByText("No Media Files Here")).toBeTruthy();
  });
});
