export type UxBudgets = {
  maxClicksToEditableTranscript: number;
  maxTabStopsBeforeTranscript: number;
  maxTabStopsInTranscript: number;
  maxPageScroll: number;
  minTranscriptLines: number;
  /** Lines required at 900 px wide or less, where the shell stacks and scrolls. Defaults to `minTranscriptLines`. */
  minTranscriptLinesNarrow?: number;
  maxLiveRegions: number;
};

export type UxStep = {
  clicks: number;
  keys: number;
};

export type UxViewport = {
  pageScrollX: number;
  pageScrollY: number;
  transcriptLines: number;
};

export type UxReport = {
  steps: Record<string, UxStep>;
  viewports: Record<string, UxViewport>;
  transcript: {
    tabStopsBeforeFirstWord: number;
    tabStopsPerWord: number;
  };
  liveRegions: number;
};

export type BudgetViolation = {
  step: string;
  metric: string;
  actual: number;
  limit: number;
  message: string;
};

/** The shell stacks into one scrolling column at this width or less. */
const NARROW_WIDTH = 900;

function overBudget(
  step: string,
  metric: string,
  actual: number,
  limit: number,
  advice: string,
): BudgetViolation {
  return {
    step,
    metric,
    actual,
    limit,
    message: `${step}.${metric} is ${actual}; budget ${limit}. ${advice}`,
  };
}

/** Every way the report misses a budget, with the step that owns it. */
export function checkBudgets(report: UxReport, budgets: UxBudgets): BudgetViolation[] {
  const violations: BudgetViolation[] = [];
  const editable = report.steps.editableTranscript;

  if (editable !== undefined && editable.clicks > budgets.maxClicksToEditableTranscript) {
    violations.push(
      overBudget(
        "editableTranscript",
        "clicks",
        editable.clicks,
        budgets.maxClicksToEditableTranscript,
        "Remove a step from create → import → transcribe.",
      ),
    );
  }

  if (report.transcript.tabStopsBeforeFirstWord > budgets.maxTabStopsBeforeTranscript) {
    violations.push(
      overBudget(
        "transcript",
        "tabStopsBeforeFirstWord",
        report.transcript.tabStopsBeforeFirstWord,
        budgets.maxTabStopsBeforeTranscript,
        "Make the transcript reachable sooner with Tab.",
      ),
    );
  }

  if (report.transcript.tabStopsPerWord > budgets.maxTabStopsInTranscript) {
    violations.push(
      overBudget(
        "transcript",
        "tabStopsPerWord",
        report.transcript.tabStopsPerWord,
        budgets.maxTabStopsInTranscript,
        "Give the transcript one tab stop, not one per word.",
      ),
    );
  }

  for (const [viewport, metrics] of Object.entries(report.viewports)) {
    if (metrics.pageScrollX > budgets.maxPageScroll) {
      violations.push(
        overBudget(
          viewport,
          "pageScrollX",
          metrics.pageScrollX,
          budgets.maxPageScroll,
          "The page must hold still; only panes scroll.",
        ),
      );
    }
    if (metrics.pageScrollY > budgets.maxPageScroll) {
      violations.push(
        overBudget(
          viewport,
          "pageScrollY",
          metrics.pageScrollY,
          budgets.maxPageScroll,
          "The page must hold still; only panes scroll.",
        ),
      );
    }
    const width = Number(viewport.split("x")[0]);
    const minLines =
      Number.isFinite(width) && width <= NARROW_WIDTH
        ? (budgets.minTranscriptLinesNarrow ?? budgets.minTranscriptLines)
        : budgets.minTranscriptLines;
    if (metrics.transcriptLines < minLines) {
      violations.push(
        overBudget(
          viewport,
          "transcriptLines",
          metrics.transcriptLines,
          minLines,
          "Keep enough transcript visible to edit.",
        ),
      );
    }
  }

  if (report.liveRegions > budgets.maxLiveRegions) {
    violations.push(
      overBudget(
        "liveRegions",
        "liveRegions",
        report.liveRegions,
        budgets.maxLiveRegions,
        "Route async news through one polite region.",
      ),
    );
  }

  return violations;
}
