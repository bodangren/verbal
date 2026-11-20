import { useState } from "react";
import type { JobRecord, ProjectDocument, TranscriptDocument } from "@verbal/core";
import {
  applyAcceptedPatches,
  parsePatchResponse,
  parseStoryboard,
  type StoryboardDocument,
  type StoryboardPatch,
} from "@verbal/storyboard";
import type { PreviewPlan, PreviewTier } from "@verbal/compose";
import { PatchReview } from "../components/PatchReview";
import { StoryboardPreview } from "../components/StoryboardPreview";
import { TranscriptEditor } from "../components/TranscriptEditor";

const GEOMETRY = { fps: 30, width: 1280, height: 720 };

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

export default function Home() {
  const [root, setRoot] = useState("");
  const [name, setName] = useState("Untitled");
  const [project, setProject] = useState<ProjectDocument | null>(null);
  const [transcript, setTranscript] = useState<TranscriptDocument | null>(null);
  const [storyboardText, setStoryboardText] = useState("");
  const [tier, setTier] = useState<PreviewTier>("fast");
  const [plan, setPlan] = useState<PreviewPlan | null>(null);
  const [patchText, setPatchText] = useState("");
  const [patches, setPatches] = useState<StoryboardPatch[]>([]);
  const [accepted, setAccepted] = useState<boolean[]>([]);
  const [importPath, setImportPath] = useState("");
  const [outputPath, setOutputPath] = useState("");
  const [brand, setBrand] = useState({
    title: "Untitled",
    outro: "Thanks for watching",
    contact: "Daniel",
    loudness: -16,
  });
  const [job, setJob] = useState<JobRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function guard(run: () => Promise<void>) {
    setError(null);
    try {
      await run();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function loadProjectFiles(next: ProjectDocument) {
    setProject(next);

    try {
      setTranscript(await request<TranscriptDocument>(`/api/transcript?root=${encodeURIComponent(root)}`));
    } catch {
      setTranscript(null);
    }

    const storyboard = await request<StoryboardDocument>(
      `/api/storyboard?root=${encodeURIComponent(root)}`,
    );
    setStoryboardText(JSON.stringify(storyboard, null, 2));
    setMessage(`Opened ${next.name}`);
  }

  function openProject() {
    return guard(async () => {
      const opened = await request<ProjectDocument>(`/api/projects?root=${encodeURIComponent(root)}`);
      await loadProjectFiles(opened);
    });
  }

  function createProject() {
    return guard(async () => {
      const created = await postJson<ProjectDocument>("/api/projects", { root, name });
      await loadProjectFiles(created);
    });
  }

  function importMedia() {
    return guard(async () => {
      const result = await postJson<{ project: ProjectDocument }>("/api/media/import", {
        projectRoot: root,
        sourcePath: importPath,
        mode: "copy",
      });
      setProject(result.project);
      setMessage("Media imported");
    });
  }

  function saveStoryboard() {
    return guard(async () => {
      const document = parseStoryboard(storyboardText);
      const saved = await putJson<StoryboardDocument>("/api/storyboard", { root, document });
      setStoryboardText(JSON.stringify(saved, null, 2));
      setMessage("Storyboard saved");
    });
  }

  function preview(nextTier: PreviewTier) {
    return guard(async () => {
      setTier(nextTier);
      const next = await postJson<PreviewPlan>("/api/storyboard/preview", {
        root,
        tier: nextTier,
        version: (plan?.version ?? 0) + 1,
        geometry: GEOMETRY,
      });
      setPlan(next);
    });
  }

  function parsePatches() {
    try {
      const parsed = parsePatchResponse(patchText);
      setPatches(parsed);
      setAccepted(parsed.map(() => true));
      setError(null);
      setMessage(`${parsed.length} hunks parsed`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function applyPatches() {
    return guard(async () => {
      const document = parseStoryboard(storyboardText);
      const next = applyAcceptedPatches(document, patches, accepted);
      const saved = await putJson<StoryboardDocument>("/api/storyboard", { root, document: next });
      setStoryboardText(JSON.stringify(saved, null, 2));
      setPatches([]);
      setAccepted([]);
      setMessage("Patches applied");
    });
  }

  async function pollJob(id: string) {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const record = await request<JobRecord>(`/api/jobs/${id}`);
      setJob(record);
      if (record.status !== "queued" && record.status !== "running") {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  function exportStoryboard() {
    return guard(async () => {
      const record = await postJson<JobRecord>("/api/storyboard/export", {
        root,
        outputPath,
        brand: {
          title: { text: brand.title },
          outro: { text: brand.outro },
          contact: { name: brand.contact },
          lowerThird: { name: brand.contact },
          loudnessLufs: brand.loudness,
        },
        geometry: GEOMETRY,
      });
      setJob(record);
      await pollJob(record.id);
    });
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1>Verbal</h1>
        <p className="subtitle">Storyboard studio</p>
      </header>

      {error !== null && <p className="status status--error">{error}</p>}
      {message !== null && <p className="status">{message}</p>}

      <section className="panel" aria-label="Project">
        <h2>Project</h2>
        <label className="field">
          Folder
          <input
            value={root}
            onChange={(event) => setRoot(event.target.value)}
            placeholder="/home/you/Verbal/demo"
          />
        </label>
        <label className="field">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <div className="row">
          <button type="button" onClick={createProject}>
            Create
          </button>
          <button type="button" onClick={openProject}>
            Open
          </button>
        </div>
        {project !== null && (
          <p className="muted">
            {project.name} · media:{" "}
            {project.media?.assetPath ?? project.media?.externalPath ?? "none"}
          </p>
        )}
      </section>

      <section className="panel" aria-label="Media">
        <h2>Media</h2>
        <label className="field">
          Source file
          <input
            value={importPath}
            onChange={(event) => setImportPath(event.target.value)}
            placeholder="/media/take.mp4"
          />
        </label>
        <button type="button" onClick={importMedia} disabled={project === null}>
          Import copy
        </button>
      </section>

      {transcript !== null && (
        <section className="panel" aria-label="Transcript">
          <h2>Transcript</h2>
          <TranscriptEditor transcript={transcript} />
        </section>
      )}

      <section className="panel" aria-label="Storyboard">
        <h2>Storyboard</h2>
        {transcript === null && <p className="muted">Open a project with a transcript first.</p>}
        <textarea
          className="editor"
          value={storyboardText}
          onChange={(event) => setStoryboardText(event.target.value)}
          spellCheck={false}
        />
        <div className="row">
          <button type="button" onClick={saveStoryboard} disabled={project === null}>
            Save
          </button>
          <button type="button" onClick={() => preview("fast")} disabled={project === null}>
            Fast preview
          </button>
          <button type="button" onClick={() => preview("full")} disabled={project === null}>
            Full preview
          </button>
        </div>
        {plan !== null && (
          <StoryboardPreview plan={plan} tier={tier} onTierChange={preview} />
        )}
      </section>

      <section className="panel" aria-label="Feedback">
        <h2>Feedback</h2>
        <textarea
          className="editor"
          value={patchText}
          onChange={(event) => setPatchText(event.target.value)}
          placeholder='{"patches":[{"type":"remove","sceneId":"s1"}]}'
          spellCheck={false}
        />
        <div className="row">
          <button type="button" onClick={parsePatches}>
            Parse patches
          </button>
        </div>
        {patches.length > 0 && (
          <PatchReview
            patches={patches}
            accepted={accepted}
            onToggle={(index) =>
              setAccepted((current) =>
                current.map((value, position) => (position === index ? !value : value)),
              )
            }
            onApply={applyPatches}
            onReject={() => {
              setPatches([]);
              setAccepted([]);
            }}
          />
        )}
      </section>

      <section className="panel" aria-label="Export">
        <h2>Export</h2>
        <label className="field">
          Output file
          <input
            value={outputPath}
            onChange={(event) => setOutputPath(event.target.value)}
            placeholder="/home/you/Verbal/demo/exports/final.mp4"
          />
        </label>
        <label className="field">
          Title
          <input
            value={brand.title}
            onChange={(event) => setBrand({ ...brand, title: event.target.value })}
          />
        </label>
        <label className="field">
          Outro
          <input
            value={brand.outro}
            onChange={(event) => setBrand({ ...brand, outro: event.target.value })}
          />
        </label>
        <label className="field">
          Contact
          <input
            value={brand.contact}
            onChange={(event) => setBrand({ ...brand, contact: event.target.value })}
          />
        </label>
        <button type="button" onClick={exportStoryboard} disabled={project === null}>
          Export storyboard
        </button>
        {job !== null && (
          <p className="muted">
            Job {job.status} · {Math.round(job.progress * 100)}%
            {job.error !== null ? ` · ${job.error}` : ""}
          </p>
        )}
      </section>
    </main>
  );
}
