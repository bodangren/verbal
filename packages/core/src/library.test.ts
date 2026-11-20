import { describe, expect, it } from "vitest";
import { createTranscript, removeWord, serializeTranscript } from "./transcript";
import { scanLibrary } from "./library";
import { createFakeFileSystem } from "../../../apps/web/server/test-support";

const FOLDER = "/library";

function projectJson(name: string, createdAt: string, media?: Record<string, string>) {
  return JSON.stringify({
    schemaVersion: 1,
    id: name,
    name,
    createdAt,
    ...(media === undefined ? {} : { media }),
  });
}

const SPOKEN = [
  { text: "one", start: 0, end: 0.3 },
  { text: "two", start: 0.4, end: 0.7 },
  { text: "three", start: 0.8, end: 1.1 },
];

describe("scanLibrary", () => {
  it("summarises each project in the folder", async () => {
    const fs = createFakeFileSystem();
    fs.files.set(`${FOLDER}/alpha/project.json`, projectJson("Alpha", "2026-11-20T00:00:00.000Z"));
    fs.files.set(
      `${FOLDER}/beta/project.json`,
      projectJson("Beta", "2026-11-21T00:00:00.000Z", { assetPath: "assets/take.mp4" }),
    );
    fs.files.set(
      `${FOLDER}/beta/transcript.json`,
      serializeTranscript(removeWord(createTranscript(SPOKEN), "w1")),
    );

    const summaries = await scanLibrary(FOLDER, {
      fs,
      listDirectory: async () => ["alpha", "beta"],
    });

    const beta = summaries.find((summary) => summary.name === "Beta");
    expect(beta).toMatchObject({
      root: `${FOLDER}/beta`,
      hasMedia: true,
      transcriptWords: 2,
      removedWords: 1,
    });

    const alpha = summaries.find((summary) => summary.name === "Alpha");
    expect(alpha).toMatchObject({ hasMedia: false, transcriptWords: 0, removedWords: 0 });
  });

  it("skips a folder that is not a project", async () => {
    const fs = createFakeFileSystem();
    fs.files.set(`${FOLDER}/alpha/project.json`, projectJson("Alpha", "2026-11-20T00:00:00.000Z"));

    const summaries = await scanLibrary(FOLDER, {
      fs,
      listDirectory: async () => ["alpha", "not-a-project"],
    });

    expect(summaries.map((summary) => summary.name)).toEqual(["Alpha"]);
  });

  it("skips an unreadable project rather than failing the scan", async () => {
    const fs = createFakeFileSystem();
    fs.files.set(`${FOLDER}/broken/project.json`, "{ not json");
    fs.files.set(`${FOLDER}/alpha/project.json`, projectJson("Alpha", "2026-11-20T00:00:00.000Z"));

    const summaries = await scanLibrary(FOLDER, {
      fs,
      listDirectory: async () => ["broken", "alpha"],
    });

    expect(summaries.map((summary) => summary.name)).toEqual(["Alpha"]);
  });

  it("reports zero words for a missing or invalid transcript", async () => {
    const fs = createFakeFileSystem();
    fs.files.set(`${FOLDER}/alpha/project.json`, projectJson("Alpha", "2026-11-20T00:00:00.000Z"));
    fs.files.set(`${FOLDER}/beta/project.json`, projectJson("Beta", "2026-11-20T00:00:00.000Z"));
    fs.files.set(`${FOLDER}/beta/transcript.json`, "{ nonsense");

    const summaries = await scanLibrary(FOLDER, {
      fs,
      listDirectory: async () => ["alpha", "beta"],
    });

    expect(summaries.map((summary) => summary.transcriptWords)).toEqual([0, 0]);
  });

  it("lists the newest project first, then by name", async () => {
    const fs = createFakeFileSystem();
    fs.files.set(`${FOLDER}/old/project.json`, projectJson("Old", "2026-01-01T00:00:00.000Z"));
    fs.files.set(`${FOLDER}/new/project.json`, projectJson("New", "2026-11-01T00:00:00.000Z"));
    fs.files.set(`${FOLDER}/zed/project.json`, projectJson("Zed", "2026-11-01T00:00:00.000Z"));

    const summaries = await scanLibrary(FOLDER, {
      fs,
      listDirectory: async () => ["old", "zed", "new"],
    });

    expect(summaries.map((summary) => summary.name)).toEqual(["New", "Zed", "Old"]);
  });
});
