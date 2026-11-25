import os from "node:os";
import path from "node:path";
import { JobRegistry, createFileJobStore, nodeFileSystem } from "@verbal/core";

let registryPromise: Promise<JobRegistry> | undefined;

/** The one Verbal data directory, shared by jobs and installed ASR assets. */
export function verbalDataDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "verbal");
}

/**
 * The process-wide job registry.
 *
 * In development, module reloads reset this promise; the registry then reloads
 * from disk and marks any job left running as interrupted.
 */
export function getJobRegistry(): Promise<JobRegistry> {
  if (registryPromise === undefined) {
    const file = path.join(verbalDataDir(), "jobs.json");
    registryPromise = JobRegistry.open(createFileJobStore(nodeFileSystem, file));
  }

  return registryPromise;
}

/** Test seam: replace the registry instance. */
export function setJobRegistry(registry: JobRegistry | undefined): void {
  registryPromise = registry === undefined ? undefined : Promise.resolve(registry);
}
