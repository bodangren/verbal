// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PreviewPlan } from "@verbal/compose";
import { StoryboardPreview } from "./StoryboardPreview";

afterEach(cleanup);

const PLAN: PreviewPlan = {
  tier: "fast",
  version: 3,
  storyboardHash: "abc",
  scenes: [
    {
      sceneId: "s1",
      visual: "slide",
      startSeconds: 0,
      endSeconds: 1,
      source: "placeholder",
    },
    {
      sceneId: "s2",
      visual: "talk",
      startSeconds: 1,
      endSeconds: 2,
      source: "talk",
    },
  ],
};

describe("StoryboardPreview", () => {
  it("shows the preview version and one row per scene", () => {
    render(<StoryboardPreview plan={PLAN} tier="fast" onTierChange={() => undefined} />);

    expect(screen.getByText("v3")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("Placeholder")).toBeTruthy();
    expect(screen.getByText("Speaker")).toBeTruthy();
  });

  it("marks the active tier", () => {
    render(<StoryboardPreview plan={PLAN} tier="fast" onTierChange={() => undefined} />);

    expect(screen.getByRole("button", { name: "Fast" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Full" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("reports a tier change", () => {
    const onTierChange = vi.fn();
    render(<StoryboardPreview plan={PLAN} tier="fast" onTierChange={onTierChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Full" }));

    expect(onTierChange).toHaveBeenCalledWith("full");
  });

  it("exposes scene sources as data attributes", () => {
    render(<StoryboardPreview plan={PLAN} tier="fast" onTierChange={() => undefined} />);

    const rows = screen.getAllByRole("listitem");
    expect(rows[0]?.getAttribute("data-source")).toBe("placeholder");
    expect(rows[1]?.getAttribute("data-source")).toBe("talk");
  });
});
