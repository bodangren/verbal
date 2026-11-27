import { describe, expect, it } from "vitest";
import { checkBudgets, type UxBudgets, type UxReport } from "./ux-budgets";

const budgets: UxBudgets = {
  maxClicksToEditableTranscript: 6,
  maxTabStopsBeforeTranscript: 2,
  maxTabStopsInTranscript: 1,
  maxPageScroll: 0,
  minTranscriptLines: 3,
  maxLiveRegions: 1,
};

function report(overrides: Partial<UxReport> = {}): UxReport {
  return {
    steps: {
      editableTranscript: { clicks: 4, keys: 1 },
    },
    viewports: {
      "1440x900": { pageScrollX: 0, pageScrollY: 0, transcriptLines: 4 },
    },
    transcript: { tabStopsBeforeFirstWord: 1, tabStopsPerWord: 1 },
    liveRegions: 1,
    ...overrides,
  };
}

describe("checkBudgets", () => {
  it("fails a report over budget and names the step", () => {
    const violations = checkBudgets(
      report({
        steps: { editableTranscript: { clicks: 8, keys: 1 } },
        transcript: { tabStopsBeforeFirstWord: 8, tabStopsPerWord: 78 },
        liveRegions: 2,
      }),
      budgets,
    );

    expect(
      violations.some(
        (violation) =>
          violation.step === "editableTranscript" &&
          violation.metric === "clicks" &&
          violation.actual === 8,
      ),
    ).toBe(true);
    expect(
      violations.some(
        (violation) =>
          violation.step === "transcript" && violation.metric === "tabStopsBeforeFirstWord",
      ),
    ).toBe(true);
    expect(violations.some((violation) => violation.step === "liveRegions")).toBe(true);
  });

  it("passes a report within budget", () => {
    expect(checkBudgets(report(), budgets)).toEqual([]);
  });

  it("checks scroll and visible transcript lines per viewport", () => {
    const violations = checkBudgets(
      report({
        viewports: {
          "1024x700": { pageScrollX: 0, pageScrollY: 24, transcriptLines: 0 },
        },
      }),
      budgets,
    );

    expect(violations.some((violation) => violation.metric === "pageScrollY")).toBe(true);
    expect(violations.some((violation) => violation.metric === "transcriptLines")).toBe(true);
  });

  it("asks for fewer transcript lines at a stacked width", () => {
    const stacked = report({
      viewports: {
        "1024x700": { pageScrollX: 0, pageScrollY: 0, transcriptLines: 3 },
        "768x1024": { pageScrollX: 0, pageScrollY: 0, transcriptLines: 1 },
        "360x740": { pageScrollX: 0, pageScrollY: 0, transcriptLines: 1 },
      },
    });

    expect(checkBudgets(stacked, { ...budgets, minTranscriptLinesNarrow: 1 })).toEqual([]);
    const strict = checkBudgets(stacked, budgets).map((violation) => violation.step);
    expect(strict).toEqual(["768x1024", "360x740"]);
  });

  it("still fails a narrow viewport that shows no transcript", () => {
    const none = report({
      viewports: { "360x740": { pageScrollX: 0, pageScrollY: 0, transcriptLines: 0 } },
    });

    const violations = checkBudgets(none, { ...budgets, minTranscriptLinesNarrow: 1 });
    expect(violations.map((violation) => violation.limit)).toEqual([1]);
  });
});
