// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { JobRecord } from "@verbal/core/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExportControls } from "./ExportControls";
import { jobStatusText } from "./job-status";

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
    render(
      <ExportControls
        disabled
        reason="Create a storyboard first."
        job={null}
        onExport={onExport}
      />,
    );

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

  it("disables export and preview with busy labels while a job runs", () => {
    render(
      <ExportControls
        disabled={false}
        job={job()}
        running
        progressPercent={42}
        onExport={vi.fn()}
        onPreview={vi.fn()}
      />,
    );

    const exportButton = screen.getByRole("button", { name: "Exporting…" }) as HTMLButtonElement;
    const previewButton = screen.getByRole("button", { name: "Rendering…" }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
    expect(previewButton.disabled).toBe(true);
  });

  it("shows a named progress element with the percent", () => {
    render(
      <ExportControls
        disabled={false}
        job={job()}
        running
        progressPercent={42}
        onExport={vi.fn()}
      />,
    );

    const bar = screen.getByRole("progressbar", { name: "Export progress" }) as HTMLProgressElement;
    expect(bar.max).toBe(100);
    expect(bar.value).toBe(42);
  });

  it("sends the start text to the status region", () => {
    const onAnnounce = vi.fn();
    const { rerender } = render(
      <ExportControls disabled={false} job={null} onExport={vi.fn()} onAnnounce={onAnnounce} />,
    );

    rerender(
      <ExportControls
        disabled={false}
        job={job()}
        running
        onExport={vi.fn()}
        onAnnounce={onAnnounce}
      />,
    );

    expect(onAnnounce).toHaveBeenCalledWith("Export started");
  });

  it("sends the done and failed texts to the status region", () => {
    const onAnnounce = vi.fn();
    const { rerender } = render(
      <ExportControls
        disabled={false}
        job={job()}
        running
        onExport={vi.fn()}
        onAnnounce={onAnnounce}
      />,
    );

    onAnnounce.mockClear();
    rerender(
      <ExportControls
        disabled={false}
        job={job({ status: "done", progress: 1 })}
        onExport={vi.fn()}
        onAnnounce={onAnnounce}
      />,
    );
    expect(onAnnounce).toHaveBeenCalledWith("Export finished");

    onAnnounce.mockClear();
    const failed = job({
      status: "failed",
      message: "Rendering step 1 of 6",
      error: "Cannot find package '@remotion/bundler' in tools/remotion",
    });
    rerender(
      <ExportControls disabled={false} job={failed} onExport={vi.fn()} onAnnounce={onAnnounce} />,
    );
    expect(onAnnounce).toHaveBeenCalledWith(jobStatusText(failed));
  });
});
