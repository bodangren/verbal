// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { splitBeats, type TakeAlignment } from "@verbal/takes";
import { TakeReview, type TakeReviewProps } from "./TakeReview";

afterEach(cleanup);

const beats = splitBeats("Hello world. This is a test.");

const alignment: TakeAlignment = {
  beats: [
    {
      beatId: "b0",
      index: 0,
      status: "good",
      coverage: 1,
      confidence: 1,
      startSeconds: 0,
      endSeconds: 2,
      spokeText: "hello world",
    },
    {
      beatId: "b1",
      index: 1,
      status: "bungled",
      coverage: 0.5,
      confidence: 0.5,
      startSeconds: 3,
      endSeconds: 5,
      spokeText: "this is a",
    },
  ],
};

function setup(overrides: Partial<TakeReviewProps> = {}) {
  const props: TakeReviewProps = {
    beats,
    alignment,
    onReread: vi.fn(),
    onStatusChange: vi.fn(),
    onSeek: vi.fn(),
    ...overrides,
  };

  render(<TakeReview {...props} />);
  return props;
}

describe("TakeReview", () => {
  it("shows each beat's status and coverage", () => {
    setup();

    const statuses = [
      ...screen.getByRole("list").querySelectorAll(".take-review__status"),
    ].map((node) => node.textContent);
    expect(statuses).toEqual(["Good", "Bungled"]);
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("seeks to a beat's source time", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: /This is a test/ }));

    expect(props.onSeek).toHaveBeenCalledWith(3);
  });

  it("offers Reread only for a non-good beat", () => {
    const props = setup();

    const buttons = screen.getAllByRole("button", { name: "Reread" });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]!);
    expect(props.onReread).toHaveBeenCalledWith("b1");
  });

  it("runs the LLM suggestion flow", () => {
    const llm = {
      provider: "fake",
      estimate: { tokens: 100, cost: 0.002 },
      proposals: [
        {
          beatId: "b1",
          index: 1,
          action: "reread" as const,
          reason: "fluffed",
          startSeconds: 1,
          endSeconds: 2,
          selected: true,
        },
      ],
      running: false,
      onPreview: vi.fn(),
      onRun: vi.fn(),
      onToggle: vi.fn(),
      onApply: vi.fn(),
      onDismiss: vi.fn(),
    };
    setup({ llm });

    expect(screen.getByText(/fake · ~100 tokens/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Apply Selected" }));
    expect(llm.onApply).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(llm.onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Suggest Edits" }));
    expect(llm.onPreview).toHaveBeenCalledTimes(1);
  });

  it("builds the cut and shows its length", () => {
    const props = setup({
      cut: { ranges: 2, durationSeconds: 2.9, building: false },
      onBuildCut: vi.fn(),
      onRenderCut: vi.fn(),
      rendering: false,
    });

    expect(screen.getByText(/2 ranges/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Build Cut" }));
    expect(props.onBuildCut).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Render Cut" }));
    expect(props.onRenderCut).toHaveBeenCalledTimes(1);
  });

  it("lets the status be overridden", () => {
    const props = setup();

    fireEvent.change(screen.getByLabelText("Status for b1"), {
      target: { value: "good" },
    });

    expect(props.onStatusChange).toHaveBeenCalledWith("b1", "good");
  });
});
