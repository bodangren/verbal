import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "styles", "globals.css"), "utf8");

const stacked = css.slice(
  css.indexOf("@media (max-width: 900px)"),
  css.indexOf("@media (max-width: 600px)"),
);

describe("edit toolbar CSS (L6d)", () => {
  it("defines the edit toolbar height in one place", () => {
    const root = css.match(/:root\s*\{[^}]*\}/);
    expect(root?.[0]).toMatch(/--edit-toolbar-height:\s*[\d.]+rem/);
  });

  it("keeps the stage scroll clear of the sticky footer", () => {
    const rule = css.match(/\.stage__scroll--edit\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("scroll-padding-bottom: var(--edit-toolbar-height)");
  });

  it("keeps the stacked workspace clear of the sticky footer", () => {
    const rule = stacked.match(/\.workspace\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("scroll-padding-bottom: var(--edit-toolbar-height)");
  });

  it("spreads the footer buttons over an even grid", () => {
    const rule = css.match(/\.toolbar--footer\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("display: grid");
    expect(rule?.[0]).toContain("grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr))");
  });
});
