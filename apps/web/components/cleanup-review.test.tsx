// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranscript } from "@verbal/core";
import { DEFAULT_ACCEPTANCE, type CleanupProposal } from "@verbal/cleanup";
import { CleanupReview } from "./CleanupReview";

afterEach(cleanup);

const transcript = createTranscript([
  { text: "keep", start: 0, end: 0.5 },
  { text: "drop", start: 0.6, end: 1 },
  { text: "tail", start: 1.5, end: 2 },
]);

const proposals: CleanupProposal[] = [
  {
    id: "p1",
    category: "filler",
    fromIndex: 1,
    toIndex: 1,
    confidence: 0.9,
    reason: "filler word",
    cover: "punch-in",
  },
  {
    id: "p2",
    category: "dead-air",
    fromIndex: 2,
    toIndex: 2,
    confidence: 0.7,
    reason: "long silence",
    cover: "slide",
  },
];

const audioFixes = [{ id: "a1", kind: "hum" as const, reason: "50 Hz hum" }];

function renderReview(overrides: Partial<Parameters<typeof CleanupReview>[0]> = {}) {
  const props = {
    transcript,
    proposals,
    audioFixes,
    acceptance: DEFAULT_ACCEPTANCE,
    onAcceptanceChange: vi.fn(),
    onFreeze: vi.fn(),
    ...overrides,
  };
  render(<CleanupReview {...props} />);
  return props;
}

describe("CleanupReview", () => {
  it("renders groups, struck-through words, covers, and audio fixes", () => {
    renderReview();

    expect(screen.getByRole("region", { name: /cleanup review/i })).toBeTruthy();
    expect(screen.getByText("Filler")).toBeTruthy();
    expect(screen.getByText("Dead air")).toBeTruthy();
    expect(screen.getByText("drop").tagName).toBe("S");
    expect(screen.getByText("50 Hz hum")).toBeTruthy();
    expect(screen.getByText(/punch-in/i)).toBeTruthy();
  });

  it("toggles a whole category", () => {
    const props = renderReview();

    fireEvent.click(screen.getByLabelText(/accept all filler/i));

    expect(props.onAcceptanceChange).toHaveBeenCalledWith({
      ...DEFAULT_ACCEPTANCE,
      categories: ["filler"],
    });
  });

  it("toggles an individual proposal", () => {
    const props = renderReview();

    fireEvent.click(screen.getByLabelText(/accept proposal p1/i));

    expect(props.onAcceptanceChange).toHaveBeenCalledWith({
      ...DEFAULT_ACCEPTANCE,
      ids: ["p1"],
    });
  });

  it("reports aggressiveness changes", () => {
    const props = renderReview();

    fireEvent.change(screen.getByLabelText(/aggressiveness/i), { target: { value: "0.8" } });

    expect(props.onAcceptanceChange).toHaveBeenCalledWith({
      ...DEFAULT_ACCEPTANCE,
      aggressiveness: 0.8,
    });
  });

  it("freezes the cleaned master", () => {
    const props = renderReview();

    fireEvent.click(screen.getByRole("button", { name: /freeze master/i }));

    expect(props.onFreeze).toHaveBeenCalledTimes(1);
  });
});
