// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { JobRecord } from "@verbal/core/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportControls } from "./ExportControls";

afterEach(cleanup);

function job(overrides: Partial<JobRecord> = {}): JobRecord {
  return {
    id: "j1",
    kind: "export",
    status: "running",
    createdAt: "2026-11-24T00:00:00.000Z",
    updatedAt: "2026-11-24T00:00:00.000Z",
    progress: 0.42,
    message: "Rendering step 1 of 6",
    result: null,
    error: null,
    ...overrides,
  };
}

describe("ExportControls", () => {
  it("disables export and names the missing step when there are no scenes", () => {
    const onExport = vi.fn();
    render(<ExportControls disabled reason="Create a storyboard first." job={null} onExport={onExport} />);

    const button = screen.getByRole("button", { name: "Export Storyboard" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Create a storyboard first.")).toBeTruthy();
    fireEvent.click(button);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("enables export once the storyboard has scenes", () => {
    const onExport = vi.fn();
    render(<ExportControls disabled={false} job={null} onExport={onExport} />);

    const button = screen.getByRole("button", { name: "Export Storyboard" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByText("Create a storyboard first.")).toBeNull();
    fireEvent.click(button);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("shows the running export while it works", () => {
    render(<ExportControls disabled={false} job={job()} onExport={vi.fn()} />);

    expect(screen.getByText("Job running · 42% · Rendering step 1 of 6")).toBeTruthy();
  });

  it("shows only the failure copy when an export fails", () => {
    render(
      <ExportControls
        disabled={false}
        job={job({
          status: "failed",
          message: "Rendering step 1 of 6",
          error: "Cannot find package '@remotion/bundler' in tools/remotion",
        })}
        onExport={vi.fn()}
      />,
    );

    const status = screen.getByText(/npm install in tools\/remotion/);
    expect(status.textContent).not.toContain("Rendering step");
  });
});
