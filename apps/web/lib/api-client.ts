import type { JobRecord, ProjectDocument, TranscriptDocument } from "@verbal/core/browser";
import type { CleanupProposal } from "@verbal/cleanup";
import type { PreviewGeometry, PreviewPlan, PreviewTier } from "@verbal/compose";
import type { MediaInfo } from "@verbal/media";
import type { ExportPresetId } from "@verbal/media/presets";
import type { StoryboardDocument } from "@verbal/storyboard";
import type { BeatProposal } from "@verbal/takes";
import type { FsListing } from "../server/fs-api";
import type { StudioTake } from "../components/StudioOverlay";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data: unknown = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

function putJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Opens the project at `root`, which is also what the browser rows pass in. */
export function getProject(root: string): Promise<ProjectDocument> {
  return request<ProjectDocument>(`/api/projects?root=${encodeURIComponent(root)}`);
}

/** Creates a project folder inside the browsed folder. */
export function createProject(root: string, name: string): Promise<ProjectDocument> {
  return postJson<ProjectDocument>("/api/projects", { root, name });
}

/** Copies a chosen file into the open project. */
export function importMedia(
  projectRoot: string,
  sourcePath: string,
): Promise<{ project: ProjectDocument }> {
  return postJson<{ project: ProjectDocument }>("/api/media/import", {
    projectRoot,
    sourcePath,
    mode: "copy",
  });
}

/** Probes the media file at `path` for the inspector. */
export function probeMedia(path: string): Promise<MediaInfo> {
  return postJson<MediaInfo>("/api/media/probe", { path });
}

export function getTranscript(root: string): Promise<TranscriptDocument> {
  return request<TranscriptDocument>(`/api/transcript?root=${encodeURIComponent(root)}`);
}

export function saveTranscript(
  root: string,
  document: TranscriptDocument,
): Promise<TranscriptDocument> {
  return putJson<TranscriptDocument>("/api/transcript", { root, document });
}

export function getCleanup(root: string): Promise<{ proposals: CleanupProposal[] }> {
  return request<{ proposals: CleanupProposal[] }>(
    `/api/cleanup?root=${encodeURIComponent(root)}`,
  );
}

export function freezeMaster(root: string): Promise<{
  master: { masterDurationSeconds: number; anchorWords: unknown[]; fingerprint: string };
}> {
  return postJson<{
    master: { masterDurationSeconds: number; anchorWords: unknown[]; fingerprint: string };
  }>("/api/cleanup/freeze", { root });
}

export function getStoryboard(root: string): Promise<StoryboardDocument> {
  return request<StoryboardDocument>(`/api/storyboard?root=${encodeURIComponent(root)}`);
}

export function saveStoryboard(
  root: string,
  document: StoryboardDocument,
): Promise<StoryboardDocument> {
  return putJson<StoryboardDocument>("/api/storyboard", { root, document });
}

export function previewStoryboard(body: {
  root: string;
  tier: PreviewTier;
  version: number;
  geometry: PreviewGeometry;
}): Promise<PreviewPlan> {
  return postJson<PreviewPlan>("/api/storyboard/preview", body);
}

export function checkPrunableAssets(root: string): Promise<{ plan: { prune: string[] } }> {
  return postJson<{ plan: { prune: string[] } }>("/api/storyboard/prune", { root });
}

export function deletePrunableAssets(root: string): Promise<{ deleted: string[] }> {
  return postJson<{ deleted: string[] }>("/api/storyboard/prune", { root, apply: true });
}

export function exportStoryboard(body: {
  root: string;
  outputPath: string;
  preset: ExportPresetId;
  includeBrand: boolean;
  brand: {
    title: { text: string };
    outro: { text: string };
    contact: { name: string };
    lowerThird: { name: string };
    loudnessLufs: number;
  };
  geometry: PreviewGeometry;
}): Promise<JobRecord> {
  return postJson<JobRecord>("/api/storyboard/export", body);
}

export function estimateImage(
  root: string,
  sceneId: string,
  prompt: string,
): Promise<{ estimate: number; provider: string }> {
  return postJson<{ estimate: number; provider: string }>("/api/storyboard/generate-image", {
    root,
    sceneId,
    prompt,
    dryRun: true,
  });
}

export function generateImage(
  root: string,
  sceneId: string,
  prompt: string,
): Promise<{ assetId: string; cost: number; document: StoryboardDocument }> {
  return postJson<{ assetId: string; cost: number; document: StoryboardDocument }>(
    "/api/storyboard/generate-image",
    { root, sceneId, prompt },
  );
}

export function estimateVideo(
  root: string,
  sceneId: string,
  prompt: string,
  durationSeconds: number,
): Promise<{ estimate: number; provider: string }> {
  return postJson<{ estimate: number; provider: string }>("/api/storyboard/generate-video", {
    root,
    sceneId,
    prompt,
    durationSeconds,
    dryRun: true,
  });
}

export function generateVideo(
  root: string,
  sceneId: string,
  prompt: string,
  durationSeconds: number,
): Promise<JobRecord> {
  return postJson<JobRecord>("/api/storyboard/generate-video", {
    root,
    sceneId,
    prompt,
    durationSeconds,
  });
}

export function getScript(root: string): Promise<{ script: string }> {
  return request<{ script: string }>(`/api/script?root=${encodeURIComponent(root)}`);
}

export function saveScript(root: string, script: string): Promise<{ script: string }> {
  return putJson<{ script: string }>("/api/script", { root, script });
}

export function listTakes(root: string): Promise<{ takes: StudioTake[] }> {
  return request<{ takes: StudioTake[] }>(`/api/takes?root=${encodeURIComponent(root)}`);
}

/**
 * Uploads a recording for normalization. The body is base64 so the WebM bytes
 * survive the JSON transport intact; the response is the normalization job.
 */
export async function uploadTake(body: {
  root: string;
  takeId: string;
  durationSeconds: number;
  dataBase64: string;
}): Promise<JobRecord> {
  const response = await fetch("/api/takes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `upload ${response.status}`);
  }
  return (await response.json()) as JobRecord;
}

export function getSystem(): Promise<{
  transcription?: { label: string; cloud: boolean; hint?: string };
}> {
  return request<{ transcription?: { label: string; cloud: boolean; hint?: string } }>(
    "/api/system",
  );
}

export function transcribe(projectRoot: string): Promise<JobRecord> {
  return postJson<JobRecord>("/api/transcribe", { projectRoot });
}

export function transcribeBatch(roots: string[]): Promise<{
  plan: { items: unknown[] };
  job: JobRecord;
}> {
  return postJson<{ plan: { items: unknown[] }; job: JobRecord }>("/api/transcribe/batch", {
    roots,
  });
}

export function getJob(id: string): Promise<JobRecord> {
  return request<JobRecord>(`/api/jobs/${id}`);
}

/** Lists folders, and media files when `includeFiles` is set, for a browser or picker. */
export function listFolder(
  target?: string,
  options: { includeFiles?: boolean } = {},
): Promise<FsListing> {
  const params: string[] = [];
  if (options.includeFiles === true) {
    params.push("includeFiles=1");
  }
  if (target !== undefined) {
    params.push(`path=${encodeURIComponent(target)}`);
  }
  const query = params.length === 0 ? "" : `?${params.join("&")}`;
  return request<FsListing>(`/api/fs/list${query}`);
}

export function startTakeTranscript(root: string, takeId: string): Promise<JobRecord> {
  return postJson<JobRecord>("/api/take-transcript", { root, takeId });
}

export function getTakeTranscript(
  root: string,
  takeId: string,
): Promise<{ words: { text: string; start: number; end: number }[] }> {
  return request<{ words: { text: string; start: number; end: number }[] }>(
    `/api/take-transcript?root=${encodeURIComponent(root)}&takeId=${encodeURIComponent(takeId)}`,
  );
}

export function previewTakeReview(
  root: string,
  takeId: string,
): Promise<{ provider: string; estimate: { tokens: number; cost: number } }> {
  return request<{ provider: string; estimate: { tokens: number; cost: number } }>(
    `/api/take-review?root=${encodeURIComponent(root)}&takeId=${encodeURIComponent(takeId)}`,
  );
}

export function runTakeReview(
  root: string,
  takeId: string,
): Promise<{ provider: string; proposals: BeatProposal[] }> {
  return postJson<{ provider: string; proposals: BeatProposal[] }>("/api/take-review", {
    root,
    takeId,
    confirm: true,
  });
}

export function buildCut(
  root: string,
  takeId: string,
): Promise<{ ranges: { startSeconds: number; endSeconds: number }[]; durationSeconds: number }> {
  return postJson<{ ranges: { startSeconds: number; endSeconds: number }[]; durationSeconds: number }>(
    "/api/assembly",
    { root, takeId },
  );
}

export function renderCut(root: string, takeId: string): Promise<JobRecord> {
  return postJson<JobRecord>("/api/assembly", { root, takeId, render: true });
}
