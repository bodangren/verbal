// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";

afterEach(cleanup);

function setup(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  const props = {
    projectName: "Alpha" as string | null,
    projectRoot: "/home/me/alpha",
    mode: "edit" as const,
    saveState: "saved" as const,
    onMode: vi.fn(),
    onExport: vi.fn(),
    ...overrides,
  };

  render(<TopBar {...props} />);
  return props;
}

describe("TopBar", () => {
  it("shows the project, save state and Export", () => {
    setup();

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Saved")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
  });

  it("marks the current mode and switches on click", () => {
    const props = setup();

    expect(
      screen.getByRole("button", { name: "Edit" }).getAttribute("aria-current"),
    ).toBe("page");

    fireEvent.click(screen.getByRole("button", { name: "Deliver" }));
    expect(props.onMode).toHaveBeenCalledWith("deliver");
  });

  it("uses one roving tab stop and supports tab-list navigation keys", () => {
    const onMode = vi.fn();
    function Controlled() {
      const [mode, setMode] = useState<"ingest" | "edit" | "deliver">("edit");
      return (
        <TopBar
          projectName="Alpha"
          projectRoot="/home/me/alpha"
          mode={mode}
          saveState="saved"
          onMode={(next) => {
            onMode(next);
            setMode(next);
          }}
          onExport={vi.fn()}
        />
      );
    }
    render(<Controlled />);
    const edit = screen.getByRole("button", { name: "Edit" });
    const ingest = screen.getByRole("button", { name: "Ingest" });
    const deliver = screen.getByRole("button", { name: "Deliver" });
    expect([ingest, edit, deliver].filter((button) => button.tabIndex === 0)).toEqual([edit]);

    edit.focus();
    fireEvent.keyDown(edit, { key: "ArrowRight" });
    expect(deliver.tabIndex).toBe(0);
    expect(edit.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(deliver);
    expect(onMode).toHaveBeenLastCalledWith("deliver");

    fireEvent.keyDown(deliver, { key: "Home" });
    expect(ingest.tabIndex).toBe(0);
    expect(document.activeElement).toBe(ingest);
    fireEvent.keyDown(ingest, { key: "End" });
    expect(deliver.tabIndex).toBe(0);
    expect(document.activeElement).toBe(deliver);
  });

  it("exports from the bar", () => {
    const props = setup();

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    expect(props.onExport).toHaveBeenCalledTimes(1);
  });
});
