/** Schema version written by this build. Newer versions are refused, not guessed at. */
export const TRANSCRIPT_SCHEMA_VERSION = 1;

/** A silence longer than this starts a new segment. */
export const DEFAULT_SEGMENT_GAP_SECONDS = 0.75;

export type TranscriptWord = {
  /** Stable identifier; edits refer to words by id, never by index. */
  id: string;
  text: string;
  /** Seconds from the start of the media. */
  start: number;
  end: number;
};

export type TranscriptSegment = {
  id: string;
  wordIds: string[];
};

/** Inserted air, attached to the word it follows. Word times stay in source seconds. */
export type TranscriptSilence = {
  afterWordId: string;
  seconds: number;
};

export type TranscriptDocument = {
  schemaVersion: number;
  words: TranscriptWord[];
  segments: TranscriptSegment[];
  /** Removed words are kept in the document so the edit stays reversible. */
  removedWordIds: string[];
  /** Optional, so transcripts saved before silences existed still parse. */
  silences?: TranscriptSilence[];
};

export type TranscriptErrorCode =
  | "invalid-json"
  | "unsupported-version"
  | "invalid-document"
  | "out-of-range"
  | "unknown-word";

/** Error raised when a transcript document or edit fails validation. */
export class TranscriptError extends Error {
  readonly code: TranscriptErrorCode;

  constructor(code: TranscriptErrorCode, message: string) {
    super(message);
    this.name = "TranscriptError";
    this.code = code;
  }
}

/** A word as produced by an ASR provider, before ids are assigned. */
export type SpokenWord = {
  text: string;
  start: number;
  end: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Splits words into segments wherever the silence between them exceeds
 * `gapSeconds`.
 */
export function groupSegments(
  words: readonly TranscriptWord[],
  gapSeconds: number = DEFAULT_SEGMENT_GAP_SECONDS,
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let current: string[] = [];
  let previousEnd: number | null = null;

  for (const word of words) {
    if (previousEnd !== null && word.start - previousEnd > gapSeconds && current.length > 0) {
      segments.push({ id: `s${segments.length}`, wordIds: current });
      current = [];
    }

    current.push(word.id);
    previousEnd = word.end;
  }

  if (current.length > 0) {
    segments.push({ id: `s${segments.length}`, wordIds: current });
  }

  return segments;
}

/** Builds a transcript document from ASR output, assigning stable ids. */
export function createTranscript(input: readonly SpokenWord[]): TranscriptDocument {
  if (input.length === 0) {
    throw new TranscriptError("invalid-document", "transcript must not be empty");
  }

  const words: TranscriptWord[] = input.map((word, index) => {
    if (word.text.trim() === "") {
      throw new TranscriptError("invalid-document", `word ${index} has empty text`);
    }
    if (!Number.isFinite(word.start) || !Number.isFinite(word.end)) {
      throw new TranscriptError("invalid-document", `word ${index} has a non-finite timestamp`);
    }
    if (word.end < word.start) {
      throw new TranscriptError("invalid-document", `word ${index} ends before it starts`);
    }

    return { id: `w${index}`, text: word.text, start: word.start, end: word.end };
  });

  return {
    schemaVersion: TRANSCRIPT_SCHEMA_VERSION,
    words,
    segments: groupSegments(words),
    removedWordIds: [],
  };
}

/** Rewrites the removal list in word order, which keeps serialisation stable. */
function withRemovals(
  transcript: TranscriptDocument,
  removed: ReadonlySet<string>,
): TranscriptDocument {
  return {
    ...transcript,
    removedWordIds: transcript.words.filter((word) => removed.has(word.id)).map((word) => word.id),
  };
}

/** Marks one word as removed. Returns the same document when it already is. */
export function removeWord(
  transcript: TranscriptDocument,
  wordId: string,
): TranscriptDocument {
  if (!transcript.words.some((word) => word.id === wordId)) {
    throw new TranscriptError("unknown-word", `unknown word id: ${wordId}`);
  }

  if (transcript.removedWordIds.includes(wordId)) {
    return transcript;
  }

  return withRemovals(transcript, new Set([...transcript.removedWordIds, wordId]));
}

/** Marks an inclusive range of words as removed. */
export function removeRange(
  transcript: TranscriptDocument,
  fromIndex: number,
  toIndex: number,
): TranscriptDocument {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < fromIndex ||
    toIndex >= transcript.words.length
  ) {
    throw new TranscriptError("out-of-range", `invalid word range ${fromIndex}..${toIndex}`);
  }

  const removed = new Set(transcript.removedWordIds);
  for (let index = fromIndex; index <= toIndex; index += 1) {
    const word = transcript.words[index];
    if (word !== undefined) {
      removed.add(word.id);
    }
  }

  // Like removeWord, re-removing an already removed range is "no change" so
  // callers can commit unconditionally without recording empty history entries.
  if (removed.size === transcript.removedWordIds.length) {
    return transcript;
  }

  return withRemovals(transcript, removed);
}

/**
 * Adds air after a word. Word times never change: they are source seconds.
 *
 * The silence follows its word id through removals and moves. A non-positive
 * or non-finite duration is treated as "no change".
 *
 * Older builds stored inserted air by shifting later words. Saved transcripts
 * from those builds keep the shifted source times. This build cannot repair
 * them automatically.
 */
export function insertSilence(
  transcript: TranscriptDocument,
  afterWordId: string,
  seconds: number,
): TranscriptDocument {
  if (!transcript.words.some((word) => word.id === afterWordId)) {
    throw new TranscriptError("unknown-word", `unknown word id: ${afterWordId}`);
  }

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return transcript;
  }

  const existing = transcript.silences ?? [];
  const silences = existing.map((entry) =>
    entry.afterWordId === afterWordId
      ? { ...entry, seconds: entry.seconds + seconds }
      : entry,
  );
  if (!silences.some((entry) => entry.afterWordId === afterWordId)) {
    silences.push({ afterWordId, seconds });
  }

  return { ...transcript, silences };
}

/** Returns the next free `s<n>` id, so repeated splits never collide. */
function nextSegmentId(used: Set<string>): string {
  let index = used.size;

  while (used.has(`s${index}`)) {
    index += 1;
  }

  used.add(`s${index}`);
  return `s${index}`;
}

/**
 * Starts a new segment at a word, keeping word ids, order, and timings.
 *
 * Splitting at a segment's first word changes nothing, which makes the action
 * safe to press twice.
 */
export function splitSegment(
  transcript: TranscriptDocument,
  beforeWordId: string,
): TranscriptDocument {
  if (!transcript.words.some((word) => word.id === beforeWordId)) {
    throw new TranscriptError("unknown-word", `unknown word id: ${beforeWordId}`);
  }

  const used = new Set(transcript.segments.map((segment) => segment.id));
  const segments: TranscriptSegment[] = [];
  let changed = false;

  for (const segment of transcript.segments) {
    const at = segment.wordIds.indexOf(beforeWordId);

    if (at <= 0) {
      segments.push(segment);
      continue;
    }

    changed = true;
    segments.push({ id: segment.id, wordIds: segment.wordIds.slice(0, at) });
    segments.push({ id: nextSegmentId(used), wordIds: segment.wordIds.slice(at) });
  }

  return changed ? { ...transcript, segments } : transcript;
}

/**
 * Moves an inclusive block of words so it starts at `targetIndex`.
 *
 * The target is clamped to the array, and a target at or inside the block is a
 * no-op, so a move always names a genuinely different order. Moved words join
 * the segment of the word they land beside, which keeps a sentence a sentence
 * across a boundary, and a segment left empty is dropped.
 */
export function moveRange(
  transcript: TranscriptDocument,
  fromIndex: number,
  toIndex: number,
  targetIndex: number,
): TranscriptDocument {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < fromIndex ||
    toIndex >= transcript.words.length
  ) {
    throw new TranscriptError("out-of-range", `invalid word range ${fromIndex}..${toIndex}`);
  }

  if (!Number.isInteger(targetIndex)) {
    throw new TranscriptError("out-of-range", `invalid move target ${targetIndex}`);
  }

  const blockLength = toIndex - fromIndex + 1;
  const maxTarget = transcript.words.length - blockLength;
  const target = Math.min(Math.max(targetIndex, 0), maxTarget);

  if (target === fromIndex || (target > fromIndex && target <= toIndex)) {
    return transcript;
  }

  const words = [...transcript.words];
  const block = words.splice(fromIndex, blockLength);
  words.splice(target, 0, ...block);

  const segmentOf = new Map<string, string>();
  for (const segment of transcript.segments) {
    for (const id of segment.wordIds) {
      segmentOf.set(id, segment.id);
    }
  }

  const moved = new Set(block.map((word) => word.id));
  const anchor = block[0];
  const before = target > 0 ? words[target - 1] : undefined;
  const after = words[target + blockLength];
  const joining =
    (before === undefined ? undefined : segmentOf.get(before.id)) ??
    (after === undefined ? undefined : segmentOf.get(after.id)) ??
    (anchor === undefined ? undefined : segmentOf.get(anchor.id));

  const owner = (id: string): string =>
    moved.has(id) ? (joining ?? segmentOf.get(id) ?? "") : (segmentOf.get(id) ?? "");

  const order = words.map((word) => word.id);
  const ids = [...new Set(transcript.segments.map((segment) => segment.id))];
  if (joining !== undefined && !ids.includes(joining)) {
    ids.push(joining);
  }

  const segments = ids
    .map((id) => ({ id, wordIds: order.filter((wordId) => owner(wordId) === id) }))
    .filter((segment) => segment.wordIds.length > 0);

  return { ...transcript, words, segments };
}

/** The words that survive the current removals, in order. */
export function keptWords(transcript: TranscriptDocument): TranscriptWord[] {
  const removed = new Set(transcript.removedWordIds);
  return transcript.words.filter((word) => !removed.has(word.id));
}

/** Serialises a transcript with a stable, diff-friendly layout. */
export function serializeTranscript(transcript: TranscriptDocument): string {
  const value: TranscriptDocument = {
    schemaVersion: transcript.schemaVersion,
    words: transcript.words,
    segments: transcript.segments,
    removedWordIds: transcript.removedWordIds,
    ...(transcript.silences === undefined || transcript.silences.length === 0
      ? {}
      : { silences: transcript.silences }),
  };
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseWord(value: unknown): TranscriptWord {
  if (!isRecord(value)) {
    throw new TranscriptError("invalid-document", "transcript word must be an object");
  }

  const { id, text, start, end } = value;

  if (typeof id !== "string" || id.trim() === "") {
    throw new TranscriptError("invalid-document", "word id must be a non-empty string");
  }
  if (typeof text !== "string" || text.trim() === "") {
    throw new TranscriptError("invalid-document", `word ${id} has empty text`);
  }
  if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end)) {
    throw new TranscriptError("invalid-document", `word ${id} has a non-finite timestamp`);
  }
  if (end < start) {
    throw new TranscriptError("invalid-document", `word ${id} ends before it starts`);
  }

  return { id, text, start, end };
}

function parseSegment(value: unknown, wordIds: ReadonlySet<string>): TranscriptSegment {
  if (!isRecord(value)) {
    throw new TranscriptError("invalid-document", "segment must be an object");
  }

  const { id, wordIds: ids } = value;

  if (typeof id !== "string" || id.trim() === "") {
    throw new TranscriptError("invalid-document", "segment id must be a non-empty string");
  }
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new TranscriptError("invalid-document", `segment ${id} must contain words`);
  }

  const parsed = ids.map((entry) => {
    if (typeof entry !== "string" || !wordIds.has(entry)) {
      throw new TranscriptError("unknown-word", `unknown word id: ${String(entry)}`);
    }
    return entry;
  });

  return { id, wordIds: parsed };
}

/** Validates an untrusted value and returns a typed transcript. */
export function validateTranscript(value: unknown): TranscriptDocument {
  if (!isRecord(value)) {
    throw new TranscriptError("invalid-document", "transcript document must be an object");
  }

  const { schemaVersion, words, segments, removedWordIds, silences } = value;

  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion)) {
    throw new TranscriptError("invalid-document", "schemaVersion must be an integer");
  }
  if (schemaVersion > TRANSCRIPT_SCHEMA_VERSION) {
    throw new TranscriptError(
      "unsupported-version",
      `transcript schemaVersion ${schemaVersion} is newer than supported version ${TRANSCRIPT_SCHEMA_VERSION}`,
    );
  }
  if (schemaVersion < 1) {
    throw new TranscriptError("invalid-document", "schemaVersion must be at least 1");
  }
  if (!Array.isArray(words) || words.length === 0) {
    throw new TranscriptError("invalid-document", "transcript must not be empty");
  }

  const parsedWords = words.map(parseWord);
  const wordIds = new Set(parsedWords.map((word) => word.id));
  if (wordIds.size !== parsedWords.length) {
    throw new TranscriptError("invalid-document", "word ids must be unique");
  }

  if (!Array.isArray(segments)) {
    throw new TranscriptError("invalid-document", "segments must be an array");
  }
  const parsedSegments = segments.map((segment) => parseSegment(segment, wordIds));

  if (!Array.isArray(removedWordIds)) {
    throw new TranscriptError("invalid-document", "removedWordIds must be an array");
  }

  const removedSet = new Set<string>();
  for (const entry of removedWordIds) {
    if (typeof entry !== "string" || !wordIds.has(entry)) {
      throw new TranscriptError("unknown-word", `unknown word id: ${String(entry)}`);
    }
    removedSet.add(entry);
  }

  let parsedSilences: TranscriptSilence[] | undefined;
  if (silences !== undefined) {
    if (!Array.isArray(silences)) {
      throw new TranscriptError("invalid-document", "silences must be an array");
    }
    parsedSilences = silences.map((entry) => {
      if (!isRecord(entry)) {
        throw new TranscriptError("invalid-document", "silence entry must be an object");
      }
      const { afterWordId, seconds } = entry;
      if (typeof afterWordId !== "string" || !wordIds.has(afterWordId)) {
        throw new TranscriptError(
          "invalid-document",
          `silence has an unknown word id: ${String(afterWordId)}`,
        );
      }
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) {
        throw new TranscriptError("invalid-document", `silence after ${afterWordId} has invalid seconds`);
      }
      return { afterWordId, seconds };
    });
    if (parsedSilences.length === 0) {
      parsedSilences = undefined;
    }
  }

  return {
    schemaVersion,
    words: parsedWords,
    segments: parsedSegments,
    removedWordIds: parsedWords
      .filter((word) => removedSet.has(word.id))
      .map((word) => word.id),
    ...(parsedSilences === undefined ? {} : { silences: parsedSilences }),
  };
}

/** Parses and validates a transcript document. */
export function parseTranscript(raw: string): TranscriptDocument {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    throw new TranscriptError("invalid-json", "transcript is not valid JSON");
  }

  return validateTranscript(value);
}
