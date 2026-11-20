import { writeFileAtomic, type FileSystem } from "./atomic";

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

export type TranscriptDocument = {
  schemaVersion: number;
  words: TranscriptWord[];
  segments: TranscriptSegment[];
  /** Removed words are kept in the document so the edit stays reversible. */
  removedWordIds: string[];
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

  return withRemovals(transcript, removed);
}

/** The words that survive the current removals, in order. */
export function keptWords(transcript: TranscriptDocument): TranscriptWord[] {
  const removed = new Set(transcript.removedWordIds);
  return transcript.words.filter((word) => !removed.has(word.id));
}

/** Serialises a transcript with a stable, diff-friendly layout. */
export function serializeTranscript(transcript: TranscriptDocument): string {
  return `${JSON.stringify(transcript, null, 2)}\n`;
}

/** Writes a transcript document atomically. */
export async function saveTranscript(
  fs: FileSystem,
  filePath: string,
  transcript: TranscriptDocument,
): Promise<void> {
  await writeFileAtomic(fs, filePath, serializeTranscript(transcript));
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

  const { schemaVersion, words, segments, removedWordIds } = value;

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

  return {
    schemaVersion,
    words: parsedWords,
    segments: parsedSegments,
    removedWordIds: parsedWords
      .filter((word) => removedSet.has(word.id))
      .map((word) => word.id),
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
