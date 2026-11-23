export type SessionMode = "ingest" | "edit" | "deliver";

export type Session = {
  root: string;
  mode: SessionMode;
};

/** localStorage key for the open project and mode. */
export const SESSION_KEY = "verbal.session";

const MODES: readonly SessionMode[] = ["ingest", "edit", "deliver"];

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem" | "removeItem">;

/** Parses a stored session, refusing anything a newer build might not know. */
export function parseSession(raw: string | null): Session | null {
  if (raw === null) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) {
      return null;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.root !== "string" || record.root.trim() === "") {
      return null;
    }
    if (!MODES.includes(record.mode as SessionMode)) {
      return null;
    }

    return { root: record.root, mode: record.mode as SessionMode };
  } catch {
    return null;
  }
}

/** The browser store, or undefined where storage is unavailable (SSR, privacy). */
export function storageOrUndefined(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function loadSession(
  storage: ReadableStorage | undefined = storageOrUndefined(),
): Session | null {
  if (storage === undefined) {
    return null;
  }
  try {
    return parseSession(storage.getItem(SESSION_KEY));
  } catch {
    return null;
  }
}

export function saveSession(
  session: Session,
  storage: WritableStorage | undefined = storageOrUndefined(),
): void {
  if (storage === undefined) {
    return;
  }
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // The session is a convenience; a full or blocked store must not break the app.
  }
}

export function clearSession(
  storage: WritableStorage | undefined = storageOrUndefined(),
): void {
  if (storage === undefined) {
    return;
  }
  try {
    storage.removeItem(SESSION_KEY);
  } catch {
    // Nothing to do; the next load falls back to the browser.
  }
}
