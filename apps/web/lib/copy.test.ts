import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
  "apps/web/pages/index.tsx",
  "apps/web/components/CapturePanel.tsx",
  "apps/web/components/CleanupReview.tsx",
  "apps/web/components/PatchReview.tsx",
  "apps/web/components/MediaPicker.tsx",
  "apps/web/components/ProjectBrowser.tsx",
];

const source = files
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const sentenceCase = [
  "Import copy",
  "Remove accepted",
  "Start preview",
  "Stop preview",
  "Stop recording",
  "Save storyboard",
  "Check prunable assets",
  "Fast preview",
  "Render preview",
  "Create storyboard",
  "Insert silence",
  "Move back",
  "Move forward",
  "Transcribe media",
  "Start batch",
  "Export storyboard",
  "New project here",
  "Source media",
  "No project open",
  "Audio fixes",
  "Freeze master",
  "Apply selected",
];

const titleCase = [
  "Import Copy",
  "Remove Accepted",
  "Start Preview",
  "Stop Preview",
  "Stop Recording",
  "Save Storyboard",
  "Check Prunable Assets",
  "Fast Preview",
  "Render Preview",
  "Create Storyboard",
  "Insert Silence",
  "Move Back",
  "Move Forward",
  "Transcribe Media",
  "Start Batch",
  "Export Storyboard",
  "New Project Here",
  "Source Media",
  "No Project Open",
  "Audio Fixes",
  "Freeze Master",
  "Apply Selected",
];

describe("UI copy", () => {
  it("uses Title Case for buttons and headings", () => {
    for (const label of sentenceCase) {
      expect(source).not.toContain(label);
    }
    for (const label of titleCase) {
      expect(source).toContain(label);
    }
  });
});
