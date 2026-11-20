import { describe, expect, it } from "vitest";
import {
  createTranscript,
  removeWord,
  type TranscriptDocument,
  type TranscriptWord,
} from "@verbal/core";
import { detectProposals } from "./detect";

function transcriptOf(texts: readonly string[]): TranscriptDocument {
  const words: { text: string; start: number; end: number }[] = texts.map((text, index) => ({
    text,
    start: index * 0.5,
    end: index * 0.5 + 0.4,
  }));
  return createTranscript(words);
}

function wordsOf(transcript: TranscriptDocument, fromIndex: number, toIndex: number): string {
  return transcript.words
    .slice(fromIndex, toIndex + 1)
    .map((word: TranscriptWord) => word.text)
    .join(" ");
}

describe("detectProposals", () => {
  it("finds nothing in a clean transcript", () => {
    expect(detectProposals(transcriptOf(["we", "shipped", "the", "feature"]))).toEqual([]);
  });

  it("proposes a filler word with high confidence", () => {
    const transcript = transcriptOf(["so", "um", "today"]);

    const proposals = detectProposals(transcript);

    expect(proposals).toHaveLength(1);
    const [proposal] = proposals;
    expect(proposal).toMatchObject({
      id: "p1",
      category: "filler",
      confidence: 0.95,
      cover: "punch-in",
      fromIndex: 1,
      toIndex: 1,
    });
    expect(proposal?.reason).toContain("um");
  });

  it("ignores case and punctuation when matching fillers", () => {
    const transcript = transcriptOf(["Um,", "yes", "uhh"]);

    expect(detectProposals(transcript).map((proposal) => proposal.fromIndex)).toEqual([0, 2]);
  });

  it("proposes the repeats of a stutter, not the first word", () => {
    const transcript = transcriptOf(["I", "I", "I", "think"]);

    const proposals = detectProposals(transcript);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      category: "stutter",
      confidence: 0.9,
      fromIndex: 1,
      toIndex: 2,
      cover: "punch-in",
    });
    expect(wordsOf(transcript, 1, 2)).toBe("I I");
  });

  it("proposes the second half of a repeated bigram as a repetition", () => {
    const transcript = transcriptOf(["I", "think", "I", "think", "we", "should"]);

    const proposals = detectProposals(transcript);

    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      category: "repetition",
      confidence: 0.8,
      fromIndex: 2,
      toIndex: 3,
      cover: "cutaway",
    });
    expect(proposals[0]?.reason).toContain("I think");
  });

  it("orders proposals by position and ids by order", () => {
    const transcript = transcriptOf(["um", "we", "shipped", "we", "shipped", "uh"]);

    const proposals = detectProposals(transcript);

    expect(proposals.map((proposal) => proposal.fromIndex)).toEqual([0, 3, 5]);
    expect(proposals.map((proposal) => proposal.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("never proposes the same word twice", () => {
    const transcript = transcriptOf(["um", "um", "um"]);

    const proposals = detectProposals(transcript);
    const covered = proposals.flatMap((proposal) =>
      Array.from({ length: proposal.toIndex - proposal.fromIndex + 1 }, (_unused, offset) => {
        return proposal.fromIndex + offset;
      }),
    );

    expect(covered).toHaveLength(new Set(covered).size);
  });

  it("skips words that are already removed", () => {
    const transcript = removeWord(transcriptOf(["so", "um", "today"]), "w1");

    expect(detectProposals(transcript)).toEqual([]);
  });

  it("prefers the filler category over a stutter for the same words", () => {
    const transcript = transcriptOf(["um", "um", "today"]);

    const categories = detectProposals(transcript).map((proposal) => proposal.category);

    expect(categories).toEqual(["filler", "filler"]);
  });

  it("accepts a custom filler list", () => {
    const transcript = transcriptOf(["so", "like", "um", "today"]);

    const proposals = detectProposals(transcript, { fillers: ["like"] });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]?.fromIndex).toBe(1);
  });
});
