import { spawn } from "child_process";
import { appConfig } from "../config.js";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [5000, 15000, 30000];

export async function callClaude(prompt: string): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const result = await runClaude(prompt);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  throw lastError ?? new Error("Claude CLI failed");
}

function runClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      appConfig.CLAUDE_PATH,
      ["-p", "--dangerously-skip-permissions"],
      { stdio: ["pipe", "pipe", "pipe"], shell: true }
    );

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error("Claude CLI timed out after 180s"));
    }, 180_000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}: ${stderr.slice(0, 300)}`));
        return;
      }
      const output = stdout.trim();
      if (!output) {
        reject(new Error(`Claude CLI returned empty output. stderr: ${stderr.slice(0, 200)}`));
        return;
      }
      resolve(output);
    });

    proc.stdin.write(prompt, "utf8");
    proc.stdin.end();
  });
}

export function parseJson<T>(response: string): T {
  let cleaned = response;
  if (cleaned.includes("```json")) {
    cleaned = cleaned.split("```json")[1].split("```")[0];
  } else if (cleaned.includes("```")) {
    cleaned = cleaned.split("```")[1].split("```")[0];
  }
  return JSON.parse(cleaned.trim()) as T;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
