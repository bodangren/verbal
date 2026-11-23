import { describe, expect, it } from "vitest";
import {
  clearSession,
  loadSession,
  parseSession,
  SESSION_KEY,
  saveSession,
} from "./session";

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    data,
  };
}

describe("session", () => {
  it("parses a stored project and mode", () => {
    expect(parseSession(JSON.stringify({ root: "/p", mode: "edit" }))).toEqual({
      root: "/p",
      mode: "edit",
    });
  });

  it("refuses an unknown mode, a blank root, or malformed JSON", () => {
    expect(parseSession(JSON.stringify({ root: "/p", mode: "render" }))).toBeNull();
    expect(parseSession(JSON.stringify({ root: "  ", mode: "edit" }))).toBeNull();
    expect(parseSession(JSON.stringify({ mode: "edit" }))).toBeNull();
    expect(parseSession("not json")).toBeNull();
    expect(parseSession(null)).toBeNull();
  });

  it("round-trips through storage", () => {
    const storage = fakeStorage();

    saveSession({ root: "/p", mode: "deliver" }, storage);

    expect(storage.data.get(SESSION_KEY)).toContain("/p");
    expect(loadSession(storage)).toEqual({ root: "/p", mode: "deliver" });

    clearSession(storage);
    expect(loadSession(storage)).toBeNull();
  });

  it("is a no-op without storage", () => {
    expect(loadSession(undefined)).toBeNull();
    expect(() => saveSession({ root: "/p", mode: "edit" }, undefined)).not.toThrow();
    expect(() => clearSession(undefined)).not.toThrow();
  });
});
