// @vitest-environment jsdom
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

    const summary = within(disclosure as HTMLElement).getByText("Export failed. Try again.");
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
});
