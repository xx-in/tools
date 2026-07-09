import { spawn, spawnSync } from "node:child_process";
import { platform } from "node:process";

export const osType = platform;

export function isNotFoundError(err: unknown): boolean {
  return (
    err instanceof Error &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function isCommandAvailable(cmd: string): boolean {
  const whichCmd = osType === "win32" ? "where" : "which";
  const result = spawnSync(whichCmd, [cmd], { stdio: "ignore" });
  return result.status === 0;
}

export interface RunCommandResult {
  success: boolean;
  code: number | null;
  stdout: Buffer;
  stderr: Buffer;
}

export function runCommand(
  cmd: string,
  args: string[],
  options: {
    stdio?: "inherit" | "pipe" | "ignore";
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<RunCommandResult> {
  const stdio = options.stdio ?? "pipe";
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio,
      env: options.env ?? process.env,
    });

    if (stdio === "inherit" || stdio === "ignore") {
      child.on("error", reject);
      child.on("close", (code) => {
        resolve({
          success: code === 0,
          code,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        });
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({
        success: code === 0,
        code,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
      });
    });
  });
}

export async function spawnCommand(
  cmd: string,
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ success: boolean; code: number | null }> {
  const result = await runCommand(cmd, args, {
    stdio: "inherit",
    env: options.env,
  });
  return { success: result.success, code: result.code };
}

export function decodeOutput(buf: Buffer): string {
  return buf.toString("utf-8");
}
