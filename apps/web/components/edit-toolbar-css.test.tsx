import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "styles", "globals.css"), "utf8");

const stacked = css.slice(
  css.indexOf("@media (max-width: 900px)"),
  css.indexOf("@media (max-width: 600px)"),
);

describe("edit toolbar CSS (L6d)", () => {
  it("defines the edit toolbar height with a fallback of at least 15rem", () => {
    const root = css.match(/:root\s*\{[^}]*\}/);
    const fallback = /--edit-toolbar-height:\s*([\d.]+)rem/.exec(root?.[0] ?? "");
    expect(fallback).not.toBeNull();
    expect(Number(fallback?.[1])).toBeGreaterThanOrEqual(15);
  });

  it("keeps the stage scroll clear of the sticky footer", () => {
    const rule = css.match(/\.stage__scroll--edit\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("scroll-padding-bottom: var(--edit-toolbar-height)");
  });

  it("keeps the stacked workspace clear of the sticky footer", () => {
    const rule = stacked.match(/\.workspace\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("scroll-padding-bottom: var(--edit-toolbar-height)");
  });

  it("wraps the footer buttons with a compact flex layout", () => {
    const rule = css.match(/\.toolbar--footer\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("display: flex");
    expect(rule?.[0]).toContain("flex-wrap: wrap");
    const buttons = css.match(/\.toolbar--footer\s*>\s*\.button\s*\{[^}]*\}/);
    expect(buttons?.[0]).toContain("flex: 1 1");
  });

  it("keeps the silence field inline instead of a full grid row", () => {
    const field = css.match(/\.toolbar--footer\s*>\s*\.field\s*\{[^}]*\}/);
    expect(field?.[0]).not.toContain("grid-column: 1 / -1");
    expect(field?.[0]).toContain("flex: 0 1 auto");
  });

  it("drops the sticky footer on a short window", () => {
    const short = css.slice(css.indexOf("@media (max-height: 520px)"));
    const rule = short.match(/\.toolbar--footer\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("position: static");
  });
});
