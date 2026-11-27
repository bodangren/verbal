import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "..", "styles", "globals.css"), "utf8");

const narrow900 = css.slice(
  css.indexOf("@media (max-width: 900px)"),
  css.indexOf("@media (max-width: 600px)"),
);

describe("narrow shell CSS (L3c)", () => {
  it("stops the app grid from sizing to its content", () => {
    const rule = css.match(/\.app\s*\{[^}]*\}/);
    expect(rule?.[0]).toContain("grid-template-columns: minmax(0, 1fr)");
  });

  it("lets the status bar shrink and ellipsises its items", () => {
    const bar = css.match(/\.statusbar\s*\{[^}]*\}/);
    expect(bar?.[0]).toContain("min-width: 0");
    const message = css.match(/\.statusbar__message\s*\{[^}]*\}/);
    expect(message?.[0]).toContain("min-width: 0");
    expect(message?.[0]).toContain("white-space: nowrap");
    expect(message?.[0]).toContain("text-overflow: ellipsis");
    const item = css.match(/\.statusbar__item\s*\{[^}]*\}/);
    expect(item?.[0]).toContain("min-width: 0");
    expect(item?.[0]).toContain("text-overflow: ellipsis");
  });

  it("keeps the sidebar at its content height on narrow screens", () => {
    const sidebar = narrow900.match(/\.sidebar\s*\{[^}]*\}/);
    expect(sidebar?.[0]).toContain("flex: 0 0 auto");
    expect(narrow900).toMatch(/\.sidebar:not\(:has\(\.browser--collapsed\)\)\s*\{[^}]*min-height:\s*120px/);
  });

  it("ellipsises the top-bar document name so a long name keeps Export on screen", () => {
    const name = css.match(/\.bar__document-name\s*\{[^}]*\}/);
    expect(name?.[0]).toContain("min-width: 0");
    expect(name?.[0]).toContain("overflow: hidden");
    expect(name?.[0]).toContain("text-overflow: ellipsis");
    expect(name?.[0]).toContain("white-space: nowrap");
  });
});
