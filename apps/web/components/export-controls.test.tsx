// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
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

    const button = screen.getByRole("button", { name: "Export Video" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("Create a storyboard first.")).toBeTruthy();
    fireEvent.click(button);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("enables export once the storyboard has scenes", () => {
    const onExport = vi.fn();
    render(<ExportControls disabled={false} job={null} onExport={onExport} />);

    const button = screen.getByRole("button", { name: "Export Video" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    expect(screen.queryByText("Create a storyboard first.")).toBeNull();
    fireEvent.click(button);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("shows the progress bar, not the job text, while the export runs", () => {
    render(
      <ExportControls disabled={false} job={job()} running progressPercent={42} onExport={vi.fn()} />,
    );

    expect(screen.getByRole("progressbar", { name: "Export progress" })).toBeTruthy();
    expect(screen.queryByText(/Job running/)).toBeNull();
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

  it("shows Exporting · N% beside a full-width progress bar while a job runs", () => {
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

    const row = screen.getByText("Exporting · 42%").closest(".export-busy");
    expect(row).not.toBeNull();
    expect(row?.querySelector("progress")).not.toBeNull();

    const css = readFileSync(join(__dirname, "..", "styles", "globals.css"), "utf8");
    const barRule = css.match(/\.export-busy progress\s*\{[^}]*\}/);
    expect(barRule?.[0]).toContain("flex: 1");
  });

  it("keeps the Preview label and only disables it while a job runs", () => {
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

    const preview = screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement;
    expect(preview.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Rendering…" })).toBeNull();
  });

  it("shows the failure message and detail inside the export panel", () => {
    const { container } = render(
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

    const alert = container.querySelector(".pane-alert");
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain("npm install in tools/remotion");
    const detail = alert?.querySelector("details");
    expect(detail).not.toBeNull();
    expect(detail?.textContent).toContain("Cannot find package '@remotion/bundler'");
  });

  it("keeps the output path in the done panel text", () => {
    const onAnnounce = vi.fn();
    const { container } = render(
      <ExportControls
        disabled={false}
        job={job({
          status: "done",
          progress: 1,
          message: null,
          result: { outputPath: "/exports/Demo.mp4" },
        })}
        onExport={vi.fn()}
        onAnnounce={onAnnounce}
      />,
    );

    expect(onAnnounce).toHaveBeenCalledWith("Export finished: /exports/Demo.mp4");
    expect(container.textContent).toContain("/exports/Demo.mp4");
    expect(container.querySelector(".export-done strong")?.textContent).toBe("Demo.mp4");
  });

  it("announces Export started once across queued to running", () => {
    const onAnnounce = vi.fn();
    const { rerender } = render(
      <ExportControls disabled={false} job={null} onExport={vi.fn()} onAnnounce={onAnnounce} />,
    );

    const queued = job({ status: "queued", progress: 0, message: null });
    rerender(
      <ExportControls
        disabled={false}
        job={queued}
        running
        onExport={vi.fn()}
        onAnnounce={onAnnounce}
      />,
    );
    rerender(
      <ExportControls
        disabled={false}
        job={{ ...queued, status: "running", progress: 0.42 }}
        running
        onExport={vi.fn()}
        onAnnounce={onAnnounce}
      />,
    );

    expect(onAnnounce).toHaveBeenCalledTimes(1);
    expect(onAnnounce).toHaveBeenCalledWith("Export started");
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
    const previewButton = screen.getByRole("button", { name: "Preview" }) as HTMLButtonElement;
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
