import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cssPath = path.join(repoRoot, "apps/web/styles/globals.css");
const css = fs.readFileSync(cssPath, "utf8");

function walk(directory, extension) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, extension));
    else if (full.endsWith(extension)) files.push(full);
  }
  return files;
}

const tsxFiles = walk(path.join(repoRoot, "apps/web"), ".tsx");
const e2eFiles = walk(path.join(repoRoot, "tools/e2e"), ".mjs");

// State classes set from conditional string fragments in className expressions.
// They are real rules, so a static attribute read alone can miss them.
const ALLOWED_CLASSES = new Set([
  "playback--collapsed", // PlaybackScreen: player collapsed by the user.
  "is-error", // StatusBar: the job message is an error.
  "is-dimmed", // Teleprompter: a beat outside the reading window.
  "entry--project", // ProjectBrowser: a project row, not a folder row.
  "entry--current", // ProjectBrowser: the open project row.
]);

// Custom properties set outside globals.css.
const ALLOWED_VARS = new Set([
  "--prompter-font-size", // Teleprompter passes it as an inline style value.
]);

function cssClasses(source) {
  return [...new Set([...source.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1]))].sort();
}

function tsxClassTokens(source) {
  const tokens = new Set();
  const literals = source.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? [];
  for (const literal of literals) {
    for (const token of literal.match(/[A-Za-z_][\w-]*/g) ?? []) tokens.add(token);
  }
  return tokens;
}

function usedClasses() {
  const used = new Set(ALLOWED_CLASSES);
  for (const file of tsxFiles) {
    for (const token of tsxClassTokens(fs.readFileSync(file, "utf8"))) used.add(token);
  }
  for (const file of e2eFiles) {
    for (const name of cssClasses(fs.readFileSync(file, "utf8"))) used.add(name);
  }
  return used;
}

describe("globals.css hygiene", () => {
  it("has no unused class selectors", () => {
    const used = usedClasses();
    const dead = cssClasses(css).filter((name) => !used.has(name));
    expect(dead, `Unused CSS classes:\n${dead.join("\n")}`).toEqual([]);
  });

  it("defines every custom property it reads", () => {
    const used = [...new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]))];
    const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
    for (const name of ALLOWED_VARS) defined.add(name);
    const missing = used.filter((name) => !defined.has(name));
    expect(missing, `Undefined custom properties:\n${missing.join("\n")}`).toEqual([]);
  });

  it("defines the bare focus ring once", () => {
    const rules = css.match(/^:focus-visible\s*\{/gm) ?? [];
    expect(rules, `Found ${rules.length} bare :focus-visible rules`).toHaveLength(1);
  });
});
