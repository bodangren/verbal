// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusBar, type StatusBarProps } from "./StatusBar";

afterEach(cleanup);

const DETAIL = "ffmpeg exited with code 1: no such file /tmp/a very long path/with spaces.mov";

function setup(overrides: Partial<StatusBarProps> = {}) {
  const props: StatusBarProps = {
    jobText: "Job failed · 100%",
    mediaLabel: "Media loaded",
    message: "Export failed. Try again.",
    error: { message: "Export failed. Try again.", detail: DETAIL },
    ...overrides,
  };

  const view = render(<StatusBar {...props} />);
  return { ...props, ...view };
}

describe("StatusBar", () => {
  it("shows the detail in a focusable disclosure", () => {
    setup();

    const disclosure = screen.getByText(DETAIL).closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure?.querySelector("pre.statusbar__detail")?.textContent).toBe(DETAIL);

    const summary = within(disclosure as HTMLElement).getByText("Error: Export failed. Try again.");
    expect(summary.tagName).toBe("SUMMARY");
    summary.focus();
    expect(document.activeElement).toBe(summary);
  });

  it("never carries the detail only in a title", () => {
    const { container } = setup();

    const titledDetail = Array.from(container.querySelectorAll("[title]")).filter(
      (element) => element.getAttribute("title") === DETAIL,
    );
    expect(titledDetail).toHaveLength(0);
    expect(container.textContent).toContain(DETAIL);
  });

  it("renders no disclosure without a detail", () => {
    const { container } = setup({
      message: "Preview ready",
      error: { message: "Preview ready" },
    });

    expect(container.querySelector("details")).toBeNull();
    expect(container.textContent).not.toContain(DETAIL);
  });

  it("keeps the message in the polite live region", () => {
    setup();

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Export failed. Try again.");
  });

  it("hides the live copy when the summary already shows the same text", () => {
    setup({
      jobText: "Export failed. Try again.",
      message: "Export failed. Try again.",
      error: null,
    });

    const status = screen.getByRole("status");
    expect(status.textContent).toBe("Export failed. Try again.");
    expect(status.classList.contains("sr-only")).toBe(true);
    expect(screen.getByText("Export failed. Try again.", { selector: ".statusbar__item" })).toBeTruthy();
  });

  it("hides the live copy when the error detail popover shows the message", () => {
    setup();

    expect(screen.getByRole("status").classList.contains("sr-only")).toBe(true);
  });

  it("keeps a plain live message visible when nothing else shows it", () => {
    setup({ jobText: "Ready", message: "Preview ready", error: null });

    expect(screen.getByRole("status").classList.contains("sr-only")).toBe(false);
  });

  it("opens the error detail upward as a popover above the bar", () => {
    setup();

    const disclosure = screen.getByText(DETAIL).closest("details");
    expect(disclosure).not.toBeNull();
    expect(disclosure?.classList.contains("statusbar__error--popover")).toBe(true);

    const css = readFileSync(join(__dirname, "..", "styles", "globals.css"), "utf8");
    const popoverRules = [...css.matchAll(/\.statusbar__error--popover[^{]*\{[^}]*\}/g)].map(
      (match) => match[0],
    );
    expect(popoverRules.length).toBeGreaterThan(0);
    expect(popoverRules.some((rule) => rule.includes("bottom: 100%"))).toBe(true);
    expect(popoverRules.some((rule) => rule.includes("position: absolute"))).toBe(true);

    const barRule = css.match(/\.statusbar\s*\{[^}]*\}/);
    expect(barRule?.[0]).not.toContain("overflow: hidden");
  });
});
