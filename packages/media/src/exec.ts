import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile) as (
  file: string,
  args: string[],
  options: { shell: boolean },
) => Promise<{ stdout: string; stderr: string }>;

/**
 * Runs a command and resolves with its output.
 *
 * The runner takes an argv array by contract: callers never build a shell
 * string, so user-supplied values cannot be interpreted as shell syntax.
 */
export type CommandRunner = (
  file: string,
  args: readonly string[],
) => Promise<{ stdout: string; stderr: string }>;

/** Default runner. Spawns without a shell and passes arguments as an argv array. */
export const runCommand: CommandRunner = async (file, args) => {
  const { stdout, stderr } = await execFileAsync(file, [...args], { shell: false });
  return { stdout, stderr };
};
