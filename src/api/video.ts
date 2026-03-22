import { invoke } from "@tauri-apps/api/core";

export interface SaveVideoResult {
  path: string;
}

export async function saveVideoRecording(
  blob: Blob,
  filename?: string
): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const data = Array.from(new Uint8Array(buffer));

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const defaultFilename = `recording_${timestamp}.webm`;

  const path = await invoke<string>("save_video", {
    filename: filename || defaultFilename,
    data,
  });

  return path;
}

export async function getVideoDirectory(): Promise<string> {
  return invoke<string>("get_video_directory");
}
