/** A single inclusive byte range. */
export type ByteRange = {
  start: number;
  end: number;
};

/** Outcome of parsing a `Range` header: a range, "unsatisfiable", or "no range". */
export type ByteRangeResult = ByteRange | "unsatisfiable" | null;

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

/**
 * Parses a single-range `Range` header against a known file size.
 *
 * `null` means "serve the whole file": the header was missing, malformed, or
 * asked for several ranges (multipart responses are not worth supporting for a
 * media player that requests one range at a time). `"unsatisfiable"` means the
 * caller should answer `416` with the current size.
 */
export function parseByteRange(header: string | null, size: number): ByteRangeResult {
  if (header === null) {
    return null;
  }

  const match = RANGE_PATTERN.exec(header.trim());
  if (match === null) {
    return null;
  }

  const [, rawStart, rawEnd] = match;

  if (size <= 0) {
    return "unsatisfiable";
  }

  // A suffix range ("bytes=-500") asks for the last N bytes.
  if (rawStart === "") {
    if (rawEnd === "") {
      return null;
    }

    const suffixLength = Number(rawEnd);
    if (!Number.isSafeInteger(suffixLength)) {
      return null;
    }
    if (suffixLength === 0) {
      return "unsatisfiable";
    }

    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(rawStart);
  if (!Number.isSafeInteger(start)) {
    return null;
  }

  if (rawEnd === "") {
    return start >= size ? "unsatisfiable" : { start, end: size - 1 };
  }

  const end = Number(rawEnd);
  if (!Number.isSafeInteger(end)) {
    return null;
  }

  if (end < start) {
    return null;
  }

  if (start >= size) {
    return "unsatisfiable";
  }

  return { start, end: Math.min(end, size - 1) };
}

/** Formats a served range as a `Content-Range` value. */
export function formatContentRange(range: ByteRange, size: number): string {
  return `bytes ${range.start}-${range.end}/${size}`;
}

/** Formats the `Content-Range` value of an unsatisfiable request. */
export function formatUnsatisfiableRange(size: number): string {
  return `bytes */${size}`;
}
