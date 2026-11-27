import type { JobRecord } from "@verbal/core/browser";
import { describe, expect, it } from "vitest";
import { clearFinishedJob, jobResultText, jobStartText, jobStatusText } from "./job-status";

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

describe("jobStatusText", () => {
  it("shows the running job, not an older one", () => {
    expect(jobStatusText(job())).toBe("Job running · 42% · Rendering step 1 of 6");
  });

  it("shows only the failure copy when a job failed", () => {
    const failed = job({
      status: "failed",
      message: "Rendering step 1 of 6",
      error: "Cannot find package '@remotion/bundler' in tools/remotion",
    });

    const text = jobStatusText(failed);
    expect(text).toContain("npm install in tools/remotion");
    expect(text).not.toContain("Rendering step");
  });

  it("has no text when there is no job", () => {
    expect(jobStatusText(null)).toBeNull();
  });
});

describe("jobStartText", () => {
  it("announces a queued or running export", () => {
    expect(jobStartText(job({ status: "queued", progress: 0 }))).toBe("Export started");
    expect(jobStartText(job())).toBe("Export started");
  });

  it("has no start text for a settled job or no job", () => {
    expect(jobStartText(job({ status: "done" }))).toBeNull();
    expect(jobStartText(null)).toBeNull();
  });
});

describe("jobResultText", () => {
  it("announces a done export", () => {
    expect(jobResultText(job({ status: "done", progress: 1 }))).toBe("Export finished");
  });

  it("announces a failure with the error copy", () => {
    const failed = job({
      status: "failed",
      error: "Cannot find package '@remotion/bundler' in tools/remotion",
    });

    expect(jobResultText(failed)).toContain("npm install in tools/remotion");
  });

  it("announces a cancelled export", () => {
    expect(jobResultText(job({ status: "cancelled" }))).toBe("Export cancelled");
  });

  it("has no result text while the job runs", () => {
    expect(jobResultText(job())).toBeNull();
  });
});

describe("clearFinishedJob", () => {
  it("clears a done job", () => {
    expect(clearFinishedJob(job({ status: "done" }))).toBeNull();
  });

  it("clears a failed job", () => {
    expect(clearFinishedJob(job({ status: "failed" }))).toBeNull();
  });

  it("keeps a running job", () => {
    const running = job();
    expect(clearFinishedJob(running)).toBe(running);
  });

  it("keeps a queued job", () => {
    const queued = job({ status: "queued" });
    expect(clearFinishedJob(queued)).toBe(queued);
  });
});
