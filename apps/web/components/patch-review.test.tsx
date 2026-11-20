// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StoryboardPatch } from "@verbal/storyboard";
import { PatchReview } from "./PatchReview";

afterEach(cleanup);

const PATCHES: StoryboardPatch[] = [
  { type: "remove", sceneId: "b" },
  { type: "move", sceneId: "a", toIndex: 0 },
];

function renderReview(overrides: Partial<Parameters<typeof PatchReview>[0]> = {}) {
  const props = {
    patches: PATCHES,
    accepted: [true, false],
    onToggle: vi.fn(),
    onApply: vi.fn(),
    onReject: vi.fn(),
    ...overrides,
  };
  render(<PatchReview {...props} />);
  return props;
}

describe("PatchReview", () => {
  it("lists each hunk with a description", () => {
    renderReview();

    expect(screen.getByRole("region", { name: /patch review/i })).toBeTruthy();
    expect(screen.getByText("Remove scene b")).toBeTruthy();
    expect(screen.getByText(/Move scene a/)).toBeTruthy();
  });

  it("shows how many hunks are selected", () => {
    renderReview();

    expect(screen.getByText("1 of 2 selected")).toBeTruthy();
  });

  it("reports a hunk toggle", () => {
    const props = renderReview();

    fireEvent.click(screen.getByLabelText("Toggle hunk 2"));

    expect(props.onToggle).toHaveBeenCalledWith(1);
  });

  it("applies the selected hunks", () => {
    const props = renderReview();

    fireEvent.click(screen.getByRole("button", { name: /apply selected/i }));

    expect(props.onApply).toHaveBeenCalledTimes(1);
  });

  it("discards the proposal", () => {
    const props = renderReview();

    fireEvent.click(screen.getByRole("button", { name: /discard/i }));

    expect(props.onReject).toHaveBeenCalledTimes(1);
  });

  it("marks accepted hunks with a data attribute", () => {
    renderReview();

    const items = screen.getAllByRole("listitem");
    expect(items[0]?.getAttribute("data-accepted")).toBe("true");
    expect(items[1]?.getAttribute("data-accepted")).toBe("false");
  });
});
