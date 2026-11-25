export type ErrorCopy = {
  /** What the user should read: the problem plus the next step. */
  message: string;
  /** The raw API or runtime text, for a details line or a title. */
  detail: string;
};

/**
 * Maps a failure to a plain message with a next step.
 *
 * Raw API text never stands alone: the known failures become instructions, and
 * the original text stays in `detail` for a tooltip or a details line.
 */
export function errorCopyFor(cause: unknown): ErrorCopy {
  const detail = cause instanceof Error ? cause.message : String(cause);
  const text = detail.toLowerCase();

  if (text.includes("no folder") || text.includes("does not exist")) {
    return {
      message: "That folder could not be opened. Use Home or Up to keep browsing.",
      detail,
    };
  }

  if (text.includes("no media") || text.includes("has no media")) {
    return {
      message: "This project has no media yet. Import a take in Ingest.",
      detail,
    };
  }

  if (
    text.includes("no transcript") ||
    (text.includes("transcript") && text.includes("not found"))
  ) {
    return {
      message: "This project has no transcript yet. Transcribe it in Ingest.",
      detail,
    };
  }

  if (text.includes("already exists")) {
    return {
      message: "A project with that name already exists. Choose another name.",
      detail,
    };
  }

  if (text.includes("absolute")) {
    return { message: "Choose a folder from the browser.", detail };
  }

  if (text.includes("cancelled")) {
    return {
      message: "The job was cancelled. Start it again when you are ready.",
      detail,
    };
  }

  if (text.includes("no speech engine") || text.includes("openai_api_key is not set")) {
    return {
      message:
        "No speech engine is set up. Install whisper (see README, Transcription setup) or set OPENAI_API_KEY, then try again.",
      detail,
    };
  }

  if (
    text.includes("remotion") &&
    (text.includes("cannot find package") || text.includes("cannot find module"))
  ) {
    return {
      message:
        "The slide renderer is not installed. Run npm install in tools/remotion, then export again.",
      detail,
    };
  }

  return {
    message: "Something went wrong. Try again, or check the server log.",
    detail,
  };
}
