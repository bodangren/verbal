import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { JobRecord } from "@verbal/core/browser";
import { getJob } from "../lib/api-client";

/** A setter for the current job, plus the functional form `guard` uses. */
export type SetJob = (
  value: JobRecord | null | ((current: JobRecord | null) => JobRecord | null),
) => void;

/** The current job and whether it still runs. Subscribes on read. */
export type JobValue = {
  job: JobRecord | null;
  runningJob: boolean;
};

/** The stable actions that never re-render their caller. */
export type JobActions = {
  setJob: SetJob;
  pollJob: (id: string) => Promise<JobRecord>;
};

const JobValueContext = createContext<JobValue | null>(null);
const JobActionsContext = createContext<JobActions | null>(null);

/**
 * Owns the current job outside `Home`, so a 500 ms poll tick re-renders only
 * the components that read the job, never the page.
 *
 * The value and the actions sit in two contexts: `useJob` subscribes to the
 * value, while `useJobActions` stays stable across poll ticks. The page reads
 * only the actions, so it never re-renders when a job updates.
 */
export function JobProvider({ children }: { children: ReactNode }) {
  const [job, setJobState] = useState<JobRecord | null>(null);

  const pollJob = useCallback(async (id: string): Promise<JobRecord> => {
    let record = await getJob(id);
    setJobState(record);

    for (let attempt = 0; attempt < 600; attempt += 1) {
      if (record.status !== "queued" && record.status !== "running") {
        return record;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
      record = await getJob(id);
      setJobState(record);
    }

    return record;
  }, []);

  const value = useMemo<JobValue>(
    () => ({
      job,
      runningJob: job !== null && (job.status === "queued" || job.status === "running"),
    }),
    [job],
  );

  const actions = useMemo<JobActions>(() => ({ setJob: setJobState, pollJob }), [pollJob]);

  return createElement(
    JobValueContext.Provider,
    { value },
    createElement(JobActionsContext.Provider, { value: actions }, children),
  );
}

/** Reads the current job; a poll tick re-renders only this component. */
export function useJob(): JobValue {
  const value = useContext(JobValueContext);
  if (value === null) {
    throw new Error("useJob must be used within a JobProvider");
  }
  return value;
}

/** Reads the stable job actions without subscribing to the job value. */
export function useJobActions(): JobActions {
  const actions = useContext(JobActionsContext);
  if (actions === null) {
    throw new Error("useJobActions must be used within a JobProvider");
  }
  return actions;
}
