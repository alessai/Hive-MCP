import { log } from "../log.js";

export type HiveJobKind = "hive";
export type HiveJobStatus = "running" | "completed" | "failed" | "cancelled";

export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface HiveJobSummary {
  run_id?: string;
  clients: string[];
  role: string;
  cwd?: string;
  timeout_seconds?: number;
  prompt_chars: number;
}

export interface HiveJobRecord {
  id: string;
  kind: HiveJobKind;
  status: HiveJobStatus;
  summary: HiveJobSummary;
  started_at: number;
  updated_at: number;
  completed_at?: number;
  cancelled_at?: number;
  last_checked_at?: number;
  error?: string;
  result?: ToolTextResult;
  controller: AbortController;
  promise: Promise<void>;
}

const MAX_JOBS = 100;
const jobs = new Map<string, HiveJobRecord>();

function createJobId(kind: HiveJobKind): string {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function pruneJobs(): void {
  if (jobs.size <= MAX_JOBS) return;
  const removable = [...jobs.values()]
    .filter(job => job.status !== "running")
    .sort((a, b) => a.updated_at - b.updated_at);

  while (jobs.size > MAX_JOBS && removable.length > 0) {
    const job = removable.shift();
    if (job) jobs.delete(job.id);
  }
}

export function startHiveJob(
  kind: HiveJobKind,
  summary: HiveJobSummary,
  run: (signal: AbortSignal) => Promise<ToolTextResult>,
): HiveJobRecord {
  const controller = new AbortController();
  const now = Date.now();
  const job: HiveJobRecord = {
    id: createJobId(kind),
    kind,
    status: "running" as HiveJobStatus,
    summary,
    started_at: now,
    updated_at: now,
    controller,
    promise: Promise.resolve(),
  };

  job.promise = run(controller.signal)
    .then((result) => {
      job.result = result;
      if (job.status !== "cancelled") {
        job.status = "completed";
      }
      job.completed_at = Date.now();
      job.updated_at = job.completed_at;
      log(`Hive job ${job.id} finished`, result.isError ? "WARN" : "INFO", {
        kind,
        run_id: summary.run_id,
        status: job.status,
        is_error: result.isError ?? false,
      });
    })
    .catch((err) => {
      job.error = err instanceof Error ? err.message : String(err);
      if (job.status !== "cancelled") {
        job.status = "failed";
      }
      job.completed_at = Date.now();
      job.updated_at = job.completed_at;
      log(`Hive job ${job.id} failed`, "ERROR", { kind, run_id: summary.run_id, error: job.error });
    })
    .finally(() => pruneJobs());

  jobs.set(job.id, job);
  pruneJobs();
  log(`Hive job ${job.id} started`, "INFO", { kind, run_id: summary.run_id, clients: summary.clients, role: summary.role });
  return job;
}

export function getHiveJob(jobId: string): HiveJobRecord | undefined {
  return jobs.get(jobId);
}

export function listHiveJobs(runId?: string): HiveJobRecord[] {
  return [...jobs.values()]
    .filter(job => !runId || job.summary.run_id === runId)
    .sort((a, b) => b.started_at - a.started_at);
}

export function cancelHiveJob(jobId: string): { ok: boolean; message: string; job?: HiveJobRecord } {
  const job = jobs.get(jobId);
  if (!job) return { ok: false, message: `No Hive job found for id "${jobId}".` };
  if (job.status !== "running") {
    return { ok: false, message: `Hive job ${jobId} is already ${job.status}.`, job };
  }

  job.status = "cancelled";
  job.cancelled_at = Date.now();
  job.updated_at = job.cancelled_at;
  job.controller.abort();
  log(`Hive job ${job.id} cancelled`, "WARN", { kind: job.kind, run_id: job.summary.run_id, clients: job.summary.clients });
  return { ok: true, message: `Hive job ${jobId} cancellation requested.`, job };
}

export async function waitForHiveJob(job: HiveJobRecord, waitMs: number): Promise<boolean> {
  if (job.status !== "running") return true;
  if (waitMs <= 0) return false;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      job.promise.then(() => true),
      new Promise<boolean>(resolve => {
        timer = setTimeout(() => resolve(false), waitMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function secondsSince(timestamp: number): number {
  return Math.max(0, Math.round((Date.now() - timestamp) / 1000));
}

function toIso(timestamp?: number): string | undefined {
  return timestamp ? new Date(timestamp).toISOString() : undefined;
}

function nextRecommendedCheckSeconds(job: HiveJobRecord): number | undefined {
  if (job.status !== "running") return undefined;
  const elapsed = secondsSince(job.started_at);
  if (elapsed < 60) return 20;
  if (elapsed < 600) return 60;
  return 120;
}

function touchJob(job: HiveJobRecord): void {
  job.last_checked_at = Date.now();
}

export function hiveJobStatus(job: HiveJobRecord): Record<string, unknown> {
  touchJob(job);
  return {
    job_id: job.id,
    run_id: job.summary.run_id ?? null,
    kind: job.kind,
    status: job.status,
    clients: job.summary.clients,
    role: job.summary.role,
    cwd: job.summary.cwd,
    elapsed_seconds: secondsSince(job.started_at),
    timeout_seconds: job.summary.timeout_seconds ?? null,
    prompt_chars: job.summary.prompt_chars,
    started_at: toIso(job.started_at),
    updated_at: toIso(job.updated_at),
    completed_at: toIso(job.completed_at),
    cancelled_at: toIso(job.cancelled_at),
    last_checked_at: toIso(job.last_checked_at),
    next_recommended_check_seconds: nextRecommendedCheckSeconds(job),
    last_event: job.status === "running"
      ? "job still running"
      : job.status === "completed"
        ? (job.result?.isError ? "job completed with tool error" : "job completed")
        : job.status === "cancelled"
          ? "job cancellation requested"
          : "job failed",
    error: job.error,
  };
}

function resultText(job: HiveJobRecord): string {
  return job.result?.content.map(part => part.text).join("\n\n") ?? "";
}

function truncatedText(text: string, maxChars = 20_000): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars)}\n\n[Output truncated by hivejob collect]`, truncated: true };
}

export function formatHiveJobPending(job: HiveJobRecord): string {
  touchJob(job);
  const clients = job.summary.clients.join(", ");
  return [
    `Hive job ${job.id} is still running.`,
    job.summary.run_id ? `Run ID: ${job.summary.run_id}` : undefined,
    `Kind: ${job.kind}`,
    `Clients: ${clients}`,
    `Role: ${job.summary.role}`,
    `Elapsed: ${secondsSince(job.started_at)}s`,
    `Next recommended check: ${nextRecommendedCheckSeconds(job)}s`,
    "",
    `Fetch later with: hivejob({ action: "get", job_id: "${job.id}" })`,
    job.summary.run_id ? `Collect run with: hivejob({ action: "collect", run_id: "${job.summary.run_id}" })` : undefined,
    `Cancel with: hivejob({ action: "cancel", job_id: "${job.id}" })`,
  ].filter((line): line is string => line !== undefined).join("\n");
}

export function formatHiveJob(job: HiveJobRecord, includeResult = true): string {
  touchJob(job);
  const clients = job.summary.clients.join(", ");
  const lines = [
    `Hive job ${job.id}`,
    `Status: ${job.status}`,
    job.summary.run_id ? `Run ID: ${job.summary.run_id}` : undefined,
    `Kind: ${job.kind}`,
    `Clients: ${clients}`,
    `Role: ${job.summary.role}`,
    `Elapsed: ${secondsSince(job.started_at)}s`,
    job.status === "running" ? `Next recommended check: ${nextRecommendedCheckSeconds(job)}s` : undefined,
    "",
    "Structured status:",
    JSON.stringify(hiveJobStatus(job), null, 2),
  ].filter((line): line is string => line !== undefined);

  if (job.error) lines.push(`Error: ${job.error}`);
  if (job.status === "running") {
    lines.push("", `Fetch later with: hivejob({ action: "get", job_id: "${job.id}" })`);
    lines.push(`Cancel with: hivejob({ action: "cancel", job_id: "${job.id}" })`);
  } else if (includeResult && job.result) {
    const text = job.result.content.map(part => part.text).join("\n\n");
    lines.push("", "Result:", text);
  }

  return lines.join("\n");
}

export function formatHiveJobList(runId?: string): string {
  const records = listHiveJobs(runId);
  if (records.length === 0) return runId
    ? `No Hive jobs found for run_id "${runId}" in this server session.`
    : "No Hive jobs have been started in this server session.";

  return records.map(job => [
    `- ${job.id}`,
    job.summary.run_id ? `run_id=${job.summary.run_id}` : undefined,
    `status=${job.status}`,
    `kind=${job.kind}`,
    `clients=${job.summary.clients.join(",")}`,
    `role=${job.summary.role}`,
    `elapsed=${secondsSince(job.started_at)}s`,
    job.status === "running" ? `next_check=${nextRecommendedCheckSeconds(job)}s` : undefined,
  ].filter((part): part is string => part !== undefined).join(" ")).join("\n");
}

export function formatHiveJobCollection(runId?: string, includeResult = true): string {
  const records = listHiveJobs(runId);
  const counts = records.reduce<Record<HiveJobStatus, number>>((acc, job) => {
    acc[job.status] += 1;
    return acc;
  }, { running: 0, completed: 0, failed: 0, cancelled: 0 });

  const completedOutputs = includeResult
    ? records
      .filter(job => job.status === "completed" && job.result)
      .map(job => {
        const output = truncatedText(resultText(job));
        return {
          job_id: job.id,
          run_id: job.summary.run_id ?? null,
          clients: job.summary.clients,
          kind: job.kind,
          is_error: job.result?.isError ?? false,
          text: output.text,
          truncated: output.truncated,
        };
      })
    : undefined;

  const nextChecks = records
    .map(nextRecommendedCheckSeconds)
    .filter((value): value is number => value !== undefined);

  return JSON.stringify({
    run_id: runId ?? null,
    status: records.length === 0 ? "empty" : counts.running > 0 ? "running" : counts.failed > 0 || counts.cancelled > 0 ? "attention_required" : "completed",
    summary: {
      total: records.length,
      ...counts,
      next_recommended_check_seconds: nextChecks.length > 0 ? Math.min(...nextChecks) : undefined,
    },
    jobs: records.map(hiveJobStatus),
    completed_outputs: completedOutputs,
    guidance: counts.running > 0
      ? "Continue direct work while these jobs run. Poll this run with hivejob action=collect after next_recommended_check_seconds instead of polling individual jobs repeatedly."
      : "All jobs in this selection have stopped. Use completed_outputs for synthesis and inspect failed/cancelled jobs if any.",
  }, null, 2);
}
