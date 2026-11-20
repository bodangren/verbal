import { JobError, type JobKind, type JobRegistry } from "@verbal/core";

export type ApiResponse = {
  status: number;
  body: unknown;
};

const KINDS: readonly JobKind[] = [
  "probe",
  "import",
  "export",
  "transcribe",
  "capture",
  "generate-video",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Job endpoints as plain functions.
 *
 * Route handlers stay a thin adapter around this, so the behaviour is tested
 * without starting a server or fabricating HTTP objects.
 */
export function createJobApi(registry: JobRegistry) {
  return {
    list(): ApiResponse {
      return { status: 200, body: { jobs: registry.list() } };
    },

    get(id: string): ApiResponse {
      const job = registry.get(id);
      return job === undefined
        ? { status: 404, body: { error: "job not found" } }
        : { status: 200, body: job };
    },

    async create(input: unknown): Promise<ApiResponse> {
      const kind = isRecord(input) ? input.kind : undefined;

      if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) {
        return {
          status: 400,
          body: { error: `kind must be one of ${KINDS.join(", ")}` },
        };
      }

      return { status: 201, body: await registry.create(kind as JobKind) };
    },

    async cancel(id: string): Promise<ApiResponse> {
      if (registry.get(id) === undefined) {
        return { status: 404, body: { error: "job not found" } };
      }

      try {
        return { status: 200, body: await registry.cancel(id) };
      } catch (error) {
        if (error instanceof JobError) {
          return { status: 409, body: { error: error.message } };
        }
        throw error;
      }
    },
  };
}

export type JobApi = ReturnType<typeof createJobApi>;
