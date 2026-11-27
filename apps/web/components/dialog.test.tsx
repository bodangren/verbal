// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

afterEach(cleanup);

function setupDialog(onClose = vi.fn(), body?: React.ReactNode) {
  render(
    <>
      <button type="button">Opener</button>
      <Dialog open title="Pick a file" onClose={onClose}>
        {body ?? (
          <>
            <button type="button">First</button>
            <button type="button">Last</button>
          </>
        )}
      </Dialog>
    </>,
  );
  return onClose;
}

function tabbables(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(
      'dialog button, dialog input, dialog select, dialog textarea, dialog [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute("disabled"));
}

describe("Dialog", () => {
  it("cycles Tab inside instead of leaving the dialog", () => {
    setupDialog();
    const controls = tabbables();
    expect(controls.length).toBeGreaterThan(1);
    const first = controls[0];
    const last = controls[controls.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();

    last?.focus();
    fireEvent.keyDown(document, { key: "Tab" });

    expect(document.activeElement).toBe(first);
    expect(document.querySelector("dialog")?.contains(document.activeElement)).toBe(true);
  });

  it("cycles Shift+Tab from the first control to the last", () => {
    setupDialog();
    const controls = tabbables();
    const first = controls[0];
    const last = controls[controls.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();

    first?.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(last);
  });

  it("closes on Escape and calls onClose", () => {
    const onClose = setupDialog();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("puts initial focus on the first control", () => {
    setupDialog();
    const first = document.querySelector("dialog .dialog__body button");

    expect(document.activeElement).toBe(first);
  });

  it("returns focus to the opener on close", () => {
    const opener = document.createElement("button");
    opener.textContent = "Real opener";
    document.body.appendChild(opener);
    opener.focus();

    const { unmount } = render(
      <Dialog open title="Pick a file" onClose={vi.fn()}>
        <button type="button">Only</button>
      </Dialog>,
    );
    expect(document.activeElement?.textContent).not.toBe("Real opener");

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("scrolls the body with 200 items", () => {
    setupDialog(
      vi.fn(),
      <>
        {Array.from({ length: 200 }, (_, index) => (
          <button key={index} type="button">
            Item {index}
          </button>
        ))}
      </>,
    );

    const body = document.querySelector("dialog .dialog__body");
    expect(body).toBeTruthy();

    const css = readFileSync(join(__dirname, "..", "styles", "globals.css"), "utf8");
    const bodyRule = css.match(/\.dialog__body\s*\{[^}]*\}/);
    expect(bodyRule?.[0]).toContain("overflow-y: auto");
    expect(screen.getByText("Item 199")).toBeTruthy();
  });
});
