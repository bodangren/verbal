import { spawn } from "node:child_process";

/** Options passed to an injected runner, so tests need no real child process. */
export type LocalRunOptions = {
  onStderr?: (chunk: string) => void;
  signal?: AbortSignal;
};

/** Runs a command with an argv array; injected so tests need no binary. */
export type LocalRunner = (
  binary: string,
  args: readonly string[],
  options?: LocalRunOptions,
) => Promise<{ stdout: string; stderr: string }>;

export function isMissingBinary(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Builds the failure message for a non-zero exit, with the CLI's own error. */
export function describeExit(binary: string, code: number | null, stderr: string): string {
  const short = `${binary} exited with code ${code}`;
  if (code === 0) {
    return short;
  }

  const tail = stderr
    .replace(/^whisper_print_progress_callback:.*$/gm, "")
    .slice(-500)
    .trim();

  return tail === "" ? short : `${short}: ${tail}`;
}

export const nodeRun: LocalRunner = (binary, args, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], { shell: false });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const abort = () => child.kill("SIGTERM");
    if (options?.signal?.aborted === true) {
      abort();
    } else {
      options?.signal?.addEventListener("abort", abort, { once: true });
    }

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
      options?.onStderr?.(chunk);
    });

    child.on("error", (error) => {
      options?.signal?.removeEventListener("abort", abort);
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    });
    child.on("close", (code) => {
      options?.signal?.removeEventListener("abort", abort);
      if (settled) {
        return;
      }
      settled = true;
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(describeExit(binary, code, stderr)));
      }
    });
  });
