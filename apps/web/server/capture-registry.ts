const controllers = new Map<string, AbortController>();

/** Registers the abort handle for a running capture. */
export function registerCapture(jobId: string): AbortController {
  const controller = new AbortController();
  controllers.set(jobId, controller);
  return controller;
}

/** Aborts a capture if one is running under this job id. */
export function abortCapture(jobId: string): boolean {
  const controller = controllers.get(jobId);
  if (controller === undefined) {
    return false;
  }
  controller.abort();
  return true;
}

export function clearCapture(jobId: string): void {
  controllers.delete(jobId);
}
