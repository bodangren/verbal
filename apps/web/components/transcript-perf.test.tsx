// @vitest-environment jsdom
// FR8: `Word` is memoized, so moving the selection by one word re-renders only
// the words that changed, not the whole 5,000-word transcript.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTranscript } from "@verbal/core/browser";
import { TranscriptEditor } from "./TranscriptEditor";

afterEach(cleanup);

function transcriptOf(count: number) {
  return createTranscript(
    Array.from({ length: count }, (_, index) => ({
      text: `word${index}`,
      start: index * 0.25,
      end: index * 0.25 + 0.2,
    })),
  );
}

describe("TranscriptEditor performance", () => {
  it("re-renders only the changed words when the selection moves by one", () => {
    const transcript = transcriptOf(5000);

    const rendered = new Set<number>();
    const onWordRender = vi.fn((index: number) => {
      rendered.add(index);
    });

    const view = render(
      <TranscriptEditor
        transcript={transcript}
        selectedRange={{ fromIndex: 2500, toIndex: 2500 }}
        onWordRender={onWordRender}
      />,
    );

    // The first render draws every word.
    expect(onWordRender).toHaveBeenCalledTimes(5000);
    expect(document.querySelectorAll('[data-word-id]')).toHaveLength(5000);

    onWordRender.mockClear();
    rendered.clear();

    view.rerender(
      <TranscriptEditor
        transcript={transcript}
        selectedRange={{ fromIndex: 2501, toIndex: 2501 }}
        onWordRender={onWordRender}
      />,
    );

    // Two words changed: 2500 left the selection and 2501 entered it.
    expect(onWordRender).toHaveBeenCalledTimes(2);
    expect([...rendered].sort((a, b) => a - b)).toEqual([2500, 2501]);
  });

  it("records the DOM node count for a 5,000-word transcript", () => {
    render(<TranscriptEditor transcript={transcriptOf(5000)} />);

    const wordNodes = document.querySelectorAll('[data-word-id]');
    const totalNodes = document.querySelectorAll("*");

    expect(wordNodes).toHaveLength(5000);
    // 5,000 words plus the listbox and its segments must stay well under the
    // old ~9,500 nodes-per-5,000-words budget.
    expect(totalNodes.length).toBeLessThan(9000);
  });
});
