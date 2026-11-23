import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
  "apps/web/pages/index.tsx",
  "apps/web/components/CapturePanel.tsx",
  "apps/web/components/CleanupReview.tsx",
  "apps/web/components/PatchReview.tsx",
  "apps/web/components/MediaPicker.tsx",
  "apps/web/components/ProjectBrowser.tsx",
  "apps/web/components/IngestStage.tsx",
  "apps/web/components/IngestInspector.tsx",
  "apps/web/components/BatchDialog.tsx",
  "apps/web/components/StudioOverlay.tsx",
  "apps/web/components/ScriptEditor.tsx",
  "apps/web/components/TakeReview.tsx",
  "apps/web/components/Teleprompter.tsx",
];

const source = files
  .map((file) => readFileSync(file, "utf8"))
  .join("\n");

const sentenceCase = [
  "Import media",
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
  "Transcribe several projects",
  "Start transcribe",
  "Media details",
  "Export storyboard",
  "New project here",
  "Next steps",
  "Use transcript",
  "Open studio",
  "No project open",
  "Audio fixes",
  "Freeze master",
  "Apply selected",
];

const titleCase = [
  "Import Media",
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
  "Transcribe Several Projects",
  "Start Transcribe",
  "Media Details",
  "Next Steps",
  "Open in Edit",
  "Transcribe Again",
  "No Media Yet",
  "Not Transcribed",
  "Use Transcript",
  "Teleprompter",
  "Studio",
  "Start Camera",
  "Open Studio",
  "Record",
  "Stop",
  "Camera",
  "Microphone",
  "Capture Settings",
  "Takes",
  "Recording",
  "Take Review",
  "Review",
  "Reread",
  "Good",
  "Bungled",
  "Skipped",
  "Improvised",
  "Export Storyboard",
  "New Project Here",
  "Audio Fixes",
  "No Project Open",
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
