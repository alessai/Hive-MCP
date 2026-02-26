import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { ResolvedClient, SpawnResult, ProgressCallback } from "../types.js";
import { MAX_OUTPUT_CHARS, MAX_CONCURRENT_AGENTS } from "../config/constants.js";
import { log } from "../log.js";

// Track active child processes for cleanup on server exit
const activeChildren = new Set<ChildProcess>();

// Concurrency limiter — prevents resource exhaustion from too many parallel agents
const MAX_QUEUE = 20;
let activeCount = 0;
const waitQueue: (() => void)[] = [];

function acquireSlot(): Promise<void> {
  if (activeCount < MAX_CONCURRENT_AGENTS) {
    activeCount++;
    return Promise.resolve();
  }
  if (waitQueue.length >= MAX_QUEUE) {
    return Promise.reject(new Error("Too many queued agent requests. Try again later."));
  }
  return new Promise<void>((resolve) => {
    waitQueue.push(() => { activeCount++; resolve(); });
  });
}

function releaseSlot(): void {
  activeCount--;
  const next = waitQueue.shift();
  if (next) next();
}

// Environment variables that should never leak to child processes
const SENSITIVE_ENV_PATTERNS = [
  /^AWS_SECRET/,
  /^AWS_SESSION_TOKEN$/,
  /^GH_TOKEN$/,
  /^GITHUB_TOKEN$/,
  /^GITLAB_TOKEN$/,
  /^BITBUCKET_TOKEN$/,
  /^SLACK_TOKEN$/,
  /^DOCKER_TOKEN$/,
  /_SECRET$/,
  /_SECRET_KEY$/,
  /_TOKEN$/,
  /_PASSWORD$/,
  /_CREDENTIAL/,
  /PRIVATE_KEY/,
  /^DATABASE_URL$/,
  /^NPM_TOKEN$/,
];

function cleanupChildren() {
  for (const child of activeChildren) {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch { /* already dead */ }
  }
  activeChildren.clear();
}

// Clean up children on exit. Use "exit" event only — signal handlers
// that call process.exit() prevent stdout from flushing (breaks MCP stdio transport).
process.on("exit", cleanupChildren);

export class BaseCLIAgent {
  protected client: ResolvedClient;

  constructor(client: ResolvedClient) {
    this.client = client;
  }

  /** Build the full args array for the CLI command */
  protected buildArgs(systemPrompt: string | undefined, userPrompt: string): string[] {
    const args: string[] = [...this.client.output_args, ...this.client.additional_args];

    if (systemPrompt && this.client.prompt_injection === "flag" && this.client.prompt_flag) {
      args.push(this.client.prompt_flag, systemPrompt);
    }

    return args;
  }

  /** Build the stdin content to pipe to the process */
  protected buildStdin(systemPrompt: string | undefined, userPrompt: string): string {
    if (systemPrompt && this.client.prompt_injection === "stdin") {
      return `${systemPrompt}\n\n${userPrompt}`;
    }
    return userPrompt;
  }

  /** Run the CLI process */
  async run(systemPrompt: string | undefined, userPrompt: string, cwd?: string, onProgress?: ProgressCallback): Promise<SpawnResult> {
    // Validate cwd if provided
    if (cwd) {
      const resolvedCwd = path.resolve(cwd);
      try {
        const stat = fs.statSync(resolvedCwd);
        if (!stat.isDirectory()) {
          return { stdout: "", stderr: `cwd is not a directory: ${cwd}`, exitCode: 1, timedOut: false };
        }
      } catch {
        return { stdout: "", stderr: `cwd does not exist: ${cwd}`, exitCode: 1, timedOut: false };
      }
      cwd = resolvedCwd;
    }

    const args = this.buildArgs(systemPrompt, userPrompt);
    const stdinContent = this.buildStdin(systemPrompt, userPrompt);
    // Strip env vars that block nested sessions, corrupt JSON output, or leak secrets
    const cleanEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key === "CLAUDECODE" || key === "FORCE_COLOR" || key === "NO_COLOR") continue;
      if (SENSITIVE_ENV_PATTERNS.some(p => p.test(key))) continue;
      if (value !== undefined) cleanEnv[key] = value;
    }
    const env = { ...cleanEnv, ...this.client.env };
    const timeoutMs = this.client.timeout_seconds * 1000;

    log(`[${this.client.name}] Spawning: ${this.client.command} ${args.map(a => a.length > 80 ? a.slice(0, 80) + "..." : a).join(" ")}`);

    // Wait for a concurrency slot
    await acquireSlot();

    return new Promise<SpawnResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;
      const spawnStart = Date.now();

      const child = spawn(this.client.command, args, {
        cwd: cwd ?? process.cwd(),
        env,
        stdio: ["pipe", "pipe", "pipe"],
        detached: true, // Create process group so we can kill the entire tree
      });

      activeChildren.add(child);

      // Periodic progress updates every 10s while waiting
      const progressInterval = onProgress ? setInterval(() => {
        const elapsed = Math.round((Date.now() - spawnStart) / 1000);
        const bytesReceived = stdout.length + stderr.length;
        const progressPct = Math.min(80, Math.round((elapsed / this.client.timeout_seconds) * 80));
        onProgress(
          `Waiting for ${this.client.name} response... (${elapsed}s elapsed, ${bytesReceived.toLocaleString()} bytes received)`,
          progressPct,
          100,
        ).catch(() => {}); // fire-and-forget, don't crash on notification failure
      }, 10_000) : undefined;

      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
        timedOut = true;
        log(`[${this.client.name}] Timeout after ${this.client.timeout_seconds}s — sending SIGTERM`);
        // Kill the entire process group (child + its subprocesses)
        try {
          if (child.pid) process.kill(-child.pid, "SIGTERM");
        } catch { /* already dead */ }
        // Force kill after 3s grace period
        killTimer = setTimeout(() => {
          try {
            if (child.pid) process.kill(-child.pid, "SIGKILL");
          } catch { /* already dead */ }
        }, 3000);
      }, timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        // Raw buffer needs to be large enough to capture verbose JSON event streams
        // (Claude's --output-format json includes init events with all tool names).
        // Final response is still capped at MAX_OUTPUT_CHARS in hive.ts.
        if (stdout.length < MAX_OUTPUT_CHARS * 20) {
          stdout += chunk.toString();
        }
      });

      child.stderr.on("data", (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_CHARS) {
          stderr += chunk.toString();
        }
      });

      // Prevent stdin errors from crashing the server (child may die before write completes)
      child.stdin.on("error", () => {});

      const finish = (exitCode: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        if (progressInterval) clearInterval(progressInterval);
        activeChildren.delete(child);
        releaseSlot();
        log(`[${this.client.name}] Exited: code=${exitCode} timedOut=${timedOut} stdout=${stdout.length}bytes stderr=${stderr.length}bytes`);
        resolve({ stdout, stderr, exitCode, timedOut });
      };

      child.on("close", (code) => finish(code));
      child.on("error", (err) => {
        const msg = (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `CLI "${this.client.command}" not found. Is it installed and in PATH?`
          : `Spawn error: ${err.message}`;
        log(`[${this.client.name}] Error: ${msg}`);
        stderr += `\n${msg}`;
        finish(1);
      });

      // Detached processes won't keep the parent alive — unref so MCP server can exit cleanly
      child.unref();

      // Write to stdin and close
      if (stdinContent) {
        child.stdin.write(stdinContent, () => {
          child.stdin.end();
        });
      } else {
        child.stdin.end();
      }
    });
  }
}
