// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BatchDialog, type BatchDialogProps } from "./BatchDialog";

afterEach(cleanup);

function setup(overrides: Partial<BatchDialogProps> = {}) {
  const props: BatchDialogProps = {
    projects: [
      { name: "Alpha", root: "/home/me/alpha" },
      { name: "Beta", root: "/home/me/beta" },
    ],
    selected: [],
    running: false,
    outcomes: [],
    onToggle: vi.fn(),
    onStart: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };

  render(<BatchDialog {...props} />);
  return props;
}

describe("BatchDialog", () => {
  it("toggles a project and starts the batch", () => {
    const props = setup({ selected: ["/home/me/alpha"] });

    fireEvent.click(screen.getByLabelText("Select Beta"));
    expect(props.onToggle).toHaveBeenCalledWith("/home/me/beta");

    fireEvent.click(screen.getByRole("button", { name: "Start Transcribe" }));
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", () => {
    const props = setup();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when the folder has no projects", () => {
    setup({ projects: [] });

    expect(screen.getByText("No Projects in This Folder")).toBeTruthy();
  });
});
