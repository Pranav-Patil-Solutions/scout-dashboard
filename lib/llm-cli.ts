import { spawn } from "node:child_process";

/**
 * Generic `claude -p` headless runner — the $0 subscription transport
 * (extracted from lib/email/llm.ts for JOBDASH-005; email classification and
 * kit generation share it). Returns the model's text from the CLI's JSON
 * envelope; throws on spawn failure, timeout, or CLI-reported error.
 */

const DEFAULT_TIMEOUT_MS = 300_000;

export function runClaudeCli(
  args: string[],
  stdinInput: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`claude -p timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`claude -p exited ${code}: ${err || out}`));
      else resolve(out);
    });
    child.stdin.write(stdinInput);
    child.stdin.end();
  });
}

export interface ClaudePromptOptions {
  model: string;
  system?: string;
  prompt: string;
  timeoutMs?: number;
}

/** One prompt in, the model's text out (unwrapped from the CLI envelope). */
export async function claudePrompt({
  model,
  system,
  prompt,
  timeoutMs,
}: ClaudePromptOptions): Promise<string> {
  const args = ["-p", "--model", model, "--output-format", "json"];
  if (system) args.push("--system-prompt", system);
  const stdout = await runClaudeCli(args, prompt, timeoutMs);
  let envelope: { is_error?: boolean; subtype?: string; result?: string };
  try {
    envelope = JSON.parse(stdout);
  } catch {
    throw new Error("CLI stdout was not JSON");
  }
  if (envelope.is_error || typeof envelope.result !== "string")
    throw new Error(`CLI error: ${envelope.subtype ?? "no result"}`);
  return envelope.result;
}
