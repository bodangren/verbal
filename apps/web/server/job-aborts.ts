const controllers = new Map<string, AbortController>();

/** Registers an abort handle for a long-running job. */
export function registerJobAbort(jobId: string): AbortController {
  const controller = new AbortController();
  controllers.set(jobId, controller);
  return controller;
}

/** Aborts a job if one is running under this id. */
export function abortJob(jobId: string): boolean {
  const controller = controllers.get(jobId);
  if (controller === undefined) {
    return false;
  }
  controller.abort();
  return true;
}

export function clearJobAbort(jobId: string): void {
  controllers.delete(jobId);
}
