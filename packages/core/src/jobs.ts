import { randomUUID } from "node:crypto";
import path from "node:path";
import { writeFileAtomic, type FileSystem } from "./atomic";

export type JobKind = "probe" | "import" | "export" | "transcribe";

export type JobStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export type JobRecord = {
  id: string;
  kind: JobKind;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  /** 0..1. */
  progress: number;
  message: string | null;
  result: unknown;
  error: string | null;
};

export type JobErrorCode = "not-found" | "illegal-transition";

/** Error raised when a job transition is not allowed. */
export class JobError extends Error {
  readonly code: JobErrorCode;

  constructor(code: JobErrorCode, message: string) {
    super(message);
    this.name = "JobError";
    this.code = code;
  }
}

/** Persistence seam for job records. */
export interface JobStore {
  load(): Promise<JobRecord[]>;
  save(jobs: readonly JobRecord[]): Promise<void>;
}

export type MemoryJobStore = JobStore & {
  snapshot(): JobRecord[];
};

/** In-memory store, used by tests and as a fallback. */
export function createMemoryJobStore(initial: readonly JobRecord[] = []): MemoryJobStore {
  let records = [...initial];

  return {
    async load() {
      return [...records];
    },
    async save(jobs) {
      records = [...jobs];
    },
    snapshot() {
      return [...records];
    },
  };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/** File-backed store. Missing or corrupt files read as an empty list. */
export function createFileJobStore(fs: FileSystem, filePath: string): JobStore {
  return {
    async load() {
      try {
        const raw = await fs.readFile(filePath);
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? (parsed as JobRecord[]) : [];
      } catch (error) {
        if (isNotFound(error) || error instanceof SyntaxError) {
          return [];
        }
        throw error;
      }
    },

    async save(jobs) {
      await fs.mkdir(path.dirname(filePath));
      await writeFileAtomic(fs, filePath, `${JSON.stringify(jobs, null, 2)}\n`);
    },
  };
}

const ALLOWED: Record<JobStatus, readonly JobStatus[]> = {
  queued: ["running", "cancelled"],
  running: ["done", "failed", "cancelled"],
  done: [],
  failed: [],
  cancelled: [],
};

export type JobListener = (jobs: readonly JobRecord[]) => void;

/**
 * Tracks background jobs and persists every change.
 *
 * On open, any job left `running` by a previous process is marked `failed`:
 * its child process is gone, and silently re-running an export is worse than
 * reporting that it was interrupted.
 */
export class JobRegistry {
  private jobs: JobRecord[] = [];
  private readonly listeners = new Set<JobListener>();

  private constructor(
    private readonly store: JobStore,
    private readonly now: () => Date,
  ) {}

  static async open(store: JobStore, now: () => Date = () => new Date()): Promise<JobRegistry> {
    const registry = new JobRegistry(store, now);
    const loaded = await store.load();
    registry.jobs = Array.isArray(loaded) ? loaded : [];
    await registry.reconcile();
    return registry;
  }

  list(): JobRecord[] {
    return [...this.jobs];
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.find((job) => job.id === id);
  }

  subscribe(listener: JobListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async create(kind: JobKind): Promise<JobRecord> {
    const timestamp = this.now().toISOString();
    const job: JobRecord = {
      id: randomUUID(),
      kind,
      status: "queued",
      createdAt: timestamp,
      updatedAt: timestamp,
      progress: 0,
      message: null,
      result: null,
      error: null,
    };

    this.jobs = [...this.jobs, job];
    await this.persist();
    return job;
  }

  async start(id: string): Promise<JobRecord> {
    return this.transition(id, "running", { progress: 0 });
  }

  async progress(id: string, fraction: number, message?: string): Promise<JobRecord> {
    const job = this.require(id);

    if (job.status !== "running") {
      throw new JobError("illegal-transition", `job ${id} is ${job.status}, not running`);
    }

    const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
    const patch: Partial<JobRecord> = { progress: clamped };
    if (message !== undefined) {
      patch.message = message;
    }

    return this.update(id, patch);
  }

  async complete(id: string, result: unknown = null): Promise<JobRecord> {
    return this.transition(id, "done", { progress: 1, result, error: null });
  }

  async fail(id: string, error: string): Promise<JobRecord> {
    return this.transition(id, "failed", { error });
  }

  async cancel(id: string): Promise<JobRecord> {
    return this.transition(id, "cancelled");
  }

  private require(id: string): JobRecord {
    const job = this.get(id);
    if (job === undefined) {
      throw new JobError("not-found", `unknown job: ${id}`);
    }
    return job;
  }

  private async transition(
    id: string,
    status: JobStatus,
    patch: Partial<JobRecord> = {},
  ): Promise<JobRecord> {
    const current = this.require(id);

    if (!ALLOWED[current.status].includes(status)) {
      throw new JobError(
        "illegal-transition",
        `cannot move job ${id} from ${current.status} to ${status}`,
      );
    }

    return this.update(id, { ...patch, status });
  }

  private async update(id: string, patch: Partial<JobRecord>): Promise<JobRecord> {
    const index = this.jobs.findIndex((job) => job.id === id);
    const current = this.jobs[index];

    if (index === -1 || current === undefined) {
      throw new JobError("not-found", `unknown job: ${id}`);
    }

    const updated: JobRecord = {
      ...current,
      ...patch,
      updatedAt: this.now().toISOString(),
    };

    this.jobs = [
      ...this.jobs.slice(0, index),
      updated,
      ...this.jobs.slice(index + 1),
    ];

    await this.persist();
    return updated;
  }

  private async reconcile(): Promise<void> {
    let changed = false;

    this.jobs = this.jobs.map((job) => {
      if (job.status !== "running") {
        return job;
      }

      changed = true;
      return {
        ...job,
        status: "failed" as const,
        error: "interrupted by restart",
        updatedAt: this.now().toISOString(),
      };
    });

    if (changed) {
      await this.persist();
    }
  }

  private async persist(): Promise<void> {
    await this.store.save(this.jobs);
    const snapshot = this.list();
    for (const listener of [...this.listeners]) {
      listener(snapshot);
    }
  }
}
