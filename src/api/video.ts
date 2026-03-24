import { invoke } from "@tauri-apps/api/core";

export interface SaveVideoResult {
  path: string;
}

export async function saveVideoRecording(
  blob: Blob,
  filename?: string
): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const chars: string[] = new Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    chars[i] = String.fromCharCode(bytes[i]);
  }
  const data = btoa(chars.join(''));

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
