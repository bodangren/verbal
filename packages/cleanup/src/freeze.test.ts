import { describe, expect, it } from "vitest";
import { createTranscript, removeWord } from "@verbal/core";
import { freezeMaster, requiresReanchor } from "./freeze";
import type { CleanupProposal } from "./types";

const transcript = createTranscript([
  { text: "keep", start: 0, end: 0.5 },
  { text: "drop", start: 0.6, end: 1 },
  { text: "tail", start: 1.5, end: 2 },
]);

function proposal(overrides: Partial<CleanupProposal> = {}): CleanupProposal {
  return {
    id: "p1",
    category: "filler",
    fromIndex: 1,
    toIndex: 1,
    confidence: 0.9,
    reason: "filler word",
    cover: "punch-in",
    ...overrides,
  };
}

describe("freezeMaster", () => {
  it("honours removals already saved in the document", () => {
    const saved = removeWord(transcript, "w1");

    const frozen = freezeMaster({
      transcript: saved,
      accepted: [],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(frozen.removedWordIds).toEqual(["w1"]);
    expect(frozen.cutList.kept).toEqual([
      { start: 0, end: 0.6 },
      { start: 1, end: 3 },
    ]);
  });

  it("counts a word that is both saved and accepted once", () => {
    const saved = removeWord(transcript, "w0");

    const frozen = freezeMaster({
      transcript: saved,
      accepted: [proposal({ fromIndex: 0, toIndex: 1 })],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(frozen.removedWordIds).toEqual(["w0", "w1"]);
  });

  it("removes accepted words and builds a cut list", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(frozen.removedWordIds).toEqual(["w1"]);
    expect(frozen.cutList.kept).toEqual([
      { start: 0, end: 0.6 },
      { start: 1, end: 3 },
    ]);
    expect(frozen.masterDurationSeconds).toBe(2.6);
  });

  it("maps surviving words into master time", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(frozen.anchorWords).toEqual([
      { id: "w0", start: 0, end: 0.5 },
      { id: "w2", start: 1.1, end: 1.6 },
    ]);
  });

  it("keeps every word when nothing is accepted", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(frozen.removedWordIds).toEqual([]);
    expect(frozen.anchorWords.map((word) => word.id)).toEqual(["w0", "w1", "w2"]);
    expect(frozen.masterDurationSeconds).toBe(3);
  });

  it("produces an empty anchor index when everything is accepted", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [proposal({ fromIndex: 0, toIndex: 2 })],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(frozen.anchorWords).toEqual([]);
    expect(frozen.masterDurationSeconds).toBe(0);
  });

  it("is deterministic", () => {
    const first = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });
    const second = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(first.fingerprint).toBe(second.fingerprint);
  });

  it("changes its fingerprint when the cut changes", () => {
    const first = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });
    const second = freezeMaster({
      transcript,
      accepted: [],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(first.fingerprint).not.toBe(second.fingerprint);
  });
});

describe("requiresReanchor", () => {
  it("is false when the storyboard points at the current master", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(requiresReanchor(frozen, frozen.fingerprint)).toBe(false);
  });

  it("is true when the master has changed", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(requiresReanchor(frozen, "stale-fingerprint")).toBe(true);
  });
});
