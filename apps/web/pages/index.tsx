import { useEffect, useState } from "react";
import type { SystemStatus, ToolStatus } from "@verbal/media";

type SystemResponse = {
  node: string;
  tools: SystemStatus;
};

function describeTool(tool: ToolStatus): string {
  if (tool.available) {
    return tool.version ?? "available";
  }
  return tool.error ?? "not found";
}

export default function Home() {
  const [system, setSystem] = useState<SystemResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/system")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json() as Promise<SystemResponse>;
      })
      .then((data) => {
        if (!cancelled) {
          setSystem(data);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="shell">
      <header className="header">
        <h1>Verbal</h1>
        <p className="subtitle">Local-first transcript-driven editing</p>
      </header>

      <section className="panel">
        <h2>System</h2>
        {error !== null && <p className="status status--error">{error}</p>}
        {error === null && system === null && <p className="muted">Checking toolchain…</p>}
        {system !== null && (
          <dl className="facts">
            <dt>Node</dt>
            <dd>{system.node}</dd>
            <dt>ffmpeg</dt>
            <dd className={system.tools.ffmpeg.available ? "" : "status--error"}>
              {describeTool(system.tools.ffmpeg)}
            </dd>
            <dt>ffprobe</dt>
            <dd className={system.tools.ffprobe.available ? "" : "status--error"}>
              {describeTool(system.tools.ffprobe)}
            </dd>
          </dl>
        )}
        {system !== null && (!system.tools.ffmpeg.available || !system.tools.ffprobe.available) && (
          <p className="status status--error">
            Install FFmpeg and make sure both <code>ffmpeg</code> and <code>ffprobe</code> are on
            your <code>PATH</code>.
          </p>
        )}
      </section>

      <section className="panel panel--muted">
        <h2>Next</h2>
        <p className="muted">
          Phase 0 scaffold. Project format, import, transcript editing, and export follow.
        </p>
      </section>
    </main>
  );
}
