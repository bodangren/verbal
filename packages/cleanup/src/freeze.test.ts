import { describe, expect, it } from "vitest";
import { createTranscript, insertSilence, moveRange, removeWord } from "@verbal/core";
import { buildTimeline } from "@verbal/media";
import { freezeMaster, legacyFingerprint, requiresReanchor } from "./freeze";
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

  it("adds inserted silence to the master duration and shifts later anchors", () => {
    const input = {
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    };
    const plain = freezeMaster({ transcript, ...input });
    const withSilence = freezeMaster({
      transcript: insertSilence(transcript, "w0", 1.5),
      ...input,
    });

    expect(withSilence.cutList.kept).toEqual([
      { start: 0, end: 0.5 },
      { start: 1, end: 3 },
    ]);
    expect(withSilence.anchorWords).toEqual([
      { id: "w0", start: 0, end: 0.5 },
      { id: "w2", start: 2.5, end: 3 },
    ]);
    expect(withSilence.masterDurationSeconds).toBe(4);
    expect(withSilence.fingerprint).not.toBe(plain.fingerprint);
  });

  it("derives the cut list, anchors and duration from the timeline after a reorder", () => {
    const reordered = moveRange(transcript, 0, 0, 2);

    const frozen = freezeMaster({
      transcript: reordered,
      accepted: [],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(frozen.cutList.kept).toEqual([
      { start: 0.6, end: 2 },
      { start: 0, end: 0.5 },
    ]);
    expect(frozen.anchorWords).toEqual([
      { id: "w1", start: 0, end: 0.4 },
      { id: "w2", start: 0.9, end: 1.4 },
      { id: "w0", start: 1.4, end: 1.9 },
    ]);
    expect(frozen.masterDurationSeconds).toBe(1.9);
  });

  it("keeps the deletion-only cut list and anchors unchanged", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    const videos = buildTimeline({
      transcript: { ...transcript, removedWordIds: ["w1"] },
      handleSeconds: 0,
      durationSeconds: 3,
    }).map((item) =>
      item.kind === "video" ? { start: item.startSeconds, end: item.endSeconds } : item,
    );

    expect(frozen.cutList.kept).toEqual([
      { start: 0, end: 0.6 },
      { start: 1, end: 3 },
    ]);
    expect(videos).toEqual([
      { start: 0, end: 0.6 },
      { start: 1, end: 3 },
    ]);
    expect(frozen.anchorWords).toEqual([
      { id: "w0", start: 0, end: 0.5 },
      { id: "w2", start: 1.1, end: 1.6 },
    ]);
    expect(frozen.masterDurationSeconds).toBe(2.6);
  });

  it("changes its fingerprint when only the order changes", () => {
    const input = {
      accepted: [],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    };
    const plain = freezeMaster({ transcript, ...input });
    const reordered = freezeMaster({
      transcript: moveRange(transcript, 1, 1, 2),
      ...input,
    });

    expect(reordered.fingerprint).not.toBe(plain.fingerprint);
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

  it("reproduces the legacy fingerprint for a fixed unedited cut", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(legacyFingerprint(frozen)).toBe(
      "716863fec07fa194d0b49bc5b7d8cc8ddb51b43315a62a2fef553e4f026507b9",
    );
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

  it("treats a stored legacy fingerprint as fresh", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(requiresReanchor(frozen, legacyFingerprint(frozen))).toBe(false);
  });

  it("treats a stored v2 fingerprint as fresh", () => {
    const frozen = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(requiresReanchor(frozen, frozen.fingerprint)).toBe(false);
  });

  it("refuses a changed order under both the v2 and the legacy fingerprint", () => {
    const plain = freezeMaster({
      transcript,
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });
    const reordered = freezeMaster({
      transcript: moveRange(transcript, 0, 0, 2),
      accepted: [proposal()],
      sourceDurationSeconds: 3,
      handleSeconds: 0,
    });

    expect(requiresReanchor(plain, reordered.fingerprint)).toBe(true);
    expect(requiresReanchor(plain, legacyFingerprint(reordered))).toBe(true);
  });

  it("rejects a matching legacy fingerprint once silence is inserted", () => {
    const spoken = createTranscript([
      { text: "one", start: 0, end: 1 },
      { text: "two", start: 1, end: 2 },
    ]);
    const input = { accepted: [], sourceDurationSeconds: 2, handleSeconds: 0 };
    const plain = freezeMaster({ transcript: spoken, ...input });
    const silenced = freezeMaster({
      transcript: insertSilence(spoken, "w1", 1),
      ...input,
    });

    expect(plain.masterDurationSeconds).toBe(2);
    expect(silenced.masterDurationSeconds).toBe(3);
    expect(legacyFingerprint(silenced)).toBe(legacyFingerprint(plain));
    expect(requiresReanchor(silenced, legacyFingerprint(plain))).toBe(true);
  });

  it("rejects a matching legacy fingerprint for a reordered timeline", () => {
    const input = { accepted: [proposal()], sourceDurationSeconds: 3, handleSeconds: 0 };
    const reordered = freezeMaster({
      transcript: moveRange(transcript, 0, 0, 2),
      ...input,
    });

    expect(requiresReanchor(reordered, legacyFingerprint(reordered))).toBe(true);
  });
});
