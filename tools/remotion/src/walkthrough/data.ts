/** Generated from the recorded section marks; see render-walkthrough.mjs. */
export type WalkthroughSection = {
  id: string;
  title: string;
  caption: string;
  from: number;
  frames: number;
  tempo: number;
};

export const FPS = 30;
export const DURATION_IN_FRAMES = 3294;

export const SECTIONS: WalkthroughSection[] = [
  { id: "01", title: "A local-first editor", caption: "Edit the video by editing its transcript", from: 0, frames: 569, tempo: 1.0 },
  { id: "02", title: "Projects are folders", caption: "project.json, the media, transcript.json, storyboard.json", from: 569, frames: 493, tempo: 1.0508 },
  { id: "03", title: "Playback in sync", caption: "The active word follows play, clicks seek, the waveform scrubs", from: 1062, frames: 452, tempo: 1.1787 },
  { id: "04", title: "Cleanup, then freeze", caption: "Fillers and stutters proposed, never removed automatically", from: 1514, frames: 569, tempo: 1.1338 },
  { id: "05", title: "The transcript is the editor", caption: "Search, insert silence, split, reorder, undo", from: 2083, frames: 436, tempo: 1.1913 },
  { id: "06", title: "Storyboard and export", caption: "Scenes anchored to words, exported with a codec preset", from: 2519, frames: 430, tempo: 1.1918 },
  { id: "07", title: "Verbal", caption: "Everything local, with the transcript as the source of truth", from: 2949, frames: 345, tempo: 1.0 },
];
