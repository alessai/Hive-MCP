import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
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
type QueueEntry = {
  run: () => void;
  reject: (err: Error) => void;
  abort?: () => void;
};

const waitQueue: QueueEntry[] = [];

function abortError(): Error {
  const err = new Error("Agent request aborted");
  err.name = "AbortError";
  return err;
}

function acquireSlot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }
  if (activeCount < MAX_CONCURRENT_AGENTS) {
    activeCount++;
    return Promise.resolve();
  }
  if (waitQueue.length >= MAX_QUEUE) {
    return Promise.reject(new Error("Too many queued agent requests. Try again later."));
  }
  return new Promise<void>((resolve, reject) => {
    const entry: QueueEntry = {
      reject,
      run: () => {
        if (entry.abort && signal) {
          signal.removeEventListener("abort", entry.abort);
        }
        if (signal?.aborted) {
          reject(abortError());
          return;
        }
        activeCount++;
        resolve();
      },
    };

    if (signal) {
      entry.abort = () => {
        const index = waitQueue.indexOf(entry);
        if (index >= 0) waitQueue.splice(index, 1);
        reject(abortError());
      };
      signal.addEventListener("abort", entry.abort, { once: true });
    }

    waitQueue.push(entry);
  });
}

function releaseSlot(): void {
  activeCount = Math.max(0, activeCount - 1);
  while (waitQueue.length > 0 && activeCount < MAX_CONCURRENT_AGENTS) {
    const before = activeCount;
    const next = waitQueue.shift();
    if (next) next.run();
    // If the queued entry was already aborted, it will not consume the slot.
    // Keep draining until a live request starts or the queue is empty.
    if (activeCount > before) break;
  }
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

function redactArgs(args: string[], promptFlag?: string): string[] {
  const valueFlags = new Set(["-p", "--prompt", "--append-system-prompt", "--password"]);
  const secretFlag = /(?:token|secret|password|api[-_]?key|credential|authorization)/i;
  if (promptFlag) valueFlags.add(promptFlag);

  let redactNext = false;
  return args.map((arg) => {
    if (redactNext) {
      redactNext = false;
      return "[REDACTED]";
    }
    if (valueFlags.has(arg) || secretFlag.test(arg)) {
      redactNext = true;
      const eq = arg.indexOf("=");
      if (eq > 0) return `${arg.slice(0, eq + 1)}[REDACTED]`;
      return arg;
    }
    return arg.length > 120 ? `${arg.slice(0, 120)}...` : arg;
  });
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
  async run(
    systemPrompt: string | undefined,
    userPrompt: string,
    cwd?: string,
    onProgress?: ProgressCallback,
    signal?: AbortSignal,
  ): Promise<SpawnResult> {
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

    log(`[${this.client.name}] Spawning CLI`, "INFO", {
      command: this.client.command,
      args: redactArgs(args, this.client.prompt_flag),
      cwd: cwd ?? process.cwd(),
      timeout_seconds: this.client.timeout_seconds,
    });

    // Wait for a concurrency slot. If the MCP request is cancelled while queued,
    // drop it before it can consume capacity or spawn a child process.
    try {
      await acquireSlot(signal);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`[${this.client.name}] Aborted before spawning`, "WARN", { error: msg });
      return { stdout: "", stderr: msg, exitCode: null, timedOut: false, aborted: true };
    }

    return new Promise<SpawnResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let aborted = false;
      let settled = false;
      const spawnStart = Date.now();

      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(this.client.command, args, {
          cwd: cwd ?? process.cwd(),
          env,
          stdio: ["pipe", "pipe", "pipe"],
          detached: true, // Create process group so we can kill the entire tree
        });
      } catch (err) {
        releaseSlot();
        const msg = err instanceof Error ? err.message : String(err);
        log(`[${this.client.name}] Spawn threw before child process was created`, "ERROR", { error: msg });
        resolve({ stdout: "", stderr: `Spawn error: ${msg}`, exitCode: 1, timedOut: false });
        return;
      }

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
      let hardResolveTimer: ReturnType<typeof setTimeout> | undefined;
      let terminationStarted = false;
      const terminateProcessGroup = (reason: "timeout" | "abort") => {
        if (settled) return;
        if (terminationStarted) {
          if (reason === "abort") aborted = true;
          return;
        }
        terminationStarted = true;
        if (reason === "timeout") {
          timedOut = true;
          log(`[${this.client.name}] Timeout after ${this.client.timeout_seconds}s — sending SIGTERM`, "WARN", {
            stdout_bytes: stdout.length,
            stderr_bytes: stderr.length,
          });
        } else {
          aborted = true;
          log(`[${this.client.name}] Request aborted — sending SIGTERM`, "WARN", {
            stdout_bytes: stdout.length,
            stderr_bytes: stderr.length,
          });
        }

        // Kill the entire process group (child + its subprocesses)
        try {
          if (child.pid) process.kill(-child.pid, "SIGTERM");
        } catch { /* already dead */ }
        // Force kill after 3s grace period
        killTimer = setTimeout(() => {
          log(`[${this.client.name}] Termination grace period elapsed — sending SIGKILL`, "WARN", { reason });
          try {
            if (child.pid) process.kill(-child.pid, "SIGKILL");
          } catch { /* already dead */ }
          // Very rarely, a child can fail to emit close after forced termination.
          // Resolve anyway so one stuck process does not consume a slot forever.
          hardResolveTimer = setTimeout(() => finish(null), 5000);
        }, 3000);
      };

      const timer = setTimeout(() => {
        terminateProcessGroup("timeout");
      }, timeoutMs);

      const onAbort = () => terminateProcessGroup("abort");
      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener("abort", onAbort, { once: true });
        }
      }

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
        if (hardResolveTimer) clearTimeout(hardResolveTimer);
        if (progressInterval) clearInterval(progressInterval);
        if (signal) signal.removeEventListener("abort", onAbort);
        activeChildren.delete(child);
        releaseSlot();
        log(`[${this.client.name}] Exited`, timedOut || aborted || exitCode !== 0 ? "WARN" : "INFO", {
          exit_code: exitCode,
          timed_out: timedOut,
          aborted,
          stdout_bytes: stdout.length,
          stderr_bytes: stderr.length,
        });
        resolve({ stdout, stderr, exitCode, timedOut, aborted });
      };

      child.on("close", (code) => finish(code));
      child.on("error", (err) => {
        const msg = (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `CLI "${this.client.command}" not found. Is it installed and in PATH?`
          : `Spawn error: ${err.message}`;
        log(`[${this.client.name}] Error: ${msg}`, "ERROR");
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
