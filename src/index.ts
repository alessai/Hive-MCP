#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleHive } from "./tools/hive.js";
import { handleConsensus } from "./tools/hive-consensus.js";
import { listClients, loadAllClients, supportsOpenCodeModelClients, opencodeModelClientHint } from "./config/registry.js";
import { createProgressCallback } from "./progress.js";
import { cmdList, cmdAdd, cmdRemove, cmdHelp, cmdLogs, cmdModels } from "./cli/commands.js";
import { listOpenCodeModels } from "./opencode/models.js";
import { ClientResolutionError, MODEL_SELECTION_SENTINEL, resolveConsensusClients } from "./resolution/clients.js";
import {
  cancelHiveJob,
  formatHiveJobCollection,
  formatHiveJob,
  formatHiveJobList,
  formatHiveJobPending,
  getHiveJob,
  startHiveJob,
  waitForHiveJob,
  type HiveJobSummary,
  type ToolTextResult,
} from "./jobs/manager.js";
import type { AgentResponse, ConsensusResponse } from "./types.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PKG_VERSION: string = JSON.parse(
  readFileSync(resolve(__dirname, "..", "package.json"), "utf-8")
).version;

// ─── CLI subcommands ─────────────────────────────────────────
const subcommand = process.argv[2];

if (subcommand === "list") {
  cmdList();
  process.exit(0);
} else if (subcommand === "add") {
  cmdAdd(process.argv.slice(3));
  process.exit(0);
} else if (subcommand === "remove") {
  cmdRemove(process.argv.slice(3));
  process.exit(0);
} else if (subcommand === "logs") {
  cmdLogs(process.argv.slice(3));
  process.exit(0);
} else if (subcommand === "models") {
  cmdModels(process.argv.slice(3));
  process.exit(0);
} else if (subcommand === "help" || subcommand === "--help" || subcommand === "-h") {
  cmdHelp();
  process.exit(0);
}

// ─── MCP server mode (default) ──────────────────────────────

const server = new McpServer({
  name: "hive",
  version: PKG_VERSION,
});

// Load clients with binary auto-detection
loadAllClients(true);

const available = listClients();
const modelClientCount = available.filter(c => c.startsWith("opencode:")).length;
const availablePreview = available.length > 40
  ? `${available.slice(0, 40).join(", ")} ... and ${available.length - 40} more (${modelClientCount} OpenCode model clients; call hivemodels for full list)`
  : available.join(", ");
const openCodeModelHint = supportsOpenCodeModelClients()
  ? ` Also supports OpenCode model clients as ${opencodeModelClientHint()} (example: opencode:openai/gpt-5.5).`
  : "";

const DEFAULT_SYNC_WAIT_SECONDS = (() => {
  const configured = Number(process.env.HIVE_SYNC_WAIT_SECONDS ?? "45");
  return Number.isFinite(configured) ? Math.min(Math.max(0, Math.floor(configured)), 300) : 45;
})();

const RUN_ID_SCHEMA = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/);

function clampWaitSeconds(value: number | undefined): number {
  return Math.min(Math.max(0, Math.floor(value ?? DEFAULT_SYNC_WAIT_SECONDS)), 300);
}

function singleResultToToolResult(result: AgentResponse): ToolTextResult {
  let text = "";
  if (result.success) {
    text = `**[${result.client}] (${result.role}) — ${result.duration_ms}ms**\n\n${result.response}`;
  } else {
    text = `**[${result.client}] (${result.role}) — FAILED — ${result.duration_ms}ms**\n\nError: ${result.error}\n\n${result.response}`;
  }

  if (result.truncated) {
    text += "\n\n*(Output was truncated to 20,000 characters)*";
  }

  return {
    content: [{ type: "text" as const, text }],
    isError: !result.success,
  };
}

function consensusResultToToolResult(result: ConsensusResponse): ToolTextResult {
  let text = `**Consensus: ${result.responses.length} agents queried (${result.role})**\n\n${result.summary}\n\n`;

  for (const resp of result.responses) {
    text += `---\n\n### ${resp.client} (${resp.duration_ms}ms)${resp.success ? "" : " — FAILED"}\n\n`;
    text += resp.response + "\n\n";
  }

  const hasErrors = result.responses.some(r => !r.success);
  return {
    content: [{ type: "text" as const, text }],
    isError: hasErrors,
  };
}

async function waitForToolJob(jobId: string, waitSeconds: number, callerSignal: AbortSignal, cancelOnCallerAbort: boolean): Promise<ToolTextResult> {
  const job = getHiveJob(jobId);
  if (!job) {
    return { content: [{ type: "text" as const, text: `No Hive job found for id "${jobId}".` }], isError: true };
  }

  let returned = false;
  const onAbort = () => {
    if (!returned && cancelOnCallerAbort) cancelHiveJob(job.id);
  };
  callerSignal.addEventListener("abort", onAbort, { once: true });

  try {
    const completed = await waitForHiveJob(job, waitSeconds * 1000);
    returned = true;
    if (completed) {
      if (job.result) return job.result;
      return {
        content: [{ type: "text" as const, text: formatHiveJob(job) }],
        isError: job.status !== "completed",
      };
    }

    return {
      content: [{ type: "text" as const, text: formatHiveJobPending(job) }],
      isError: false,
    };
  } finally {
    returned = true;
    callerSignal.removeEventListener("abort", onAbort);
  }
}

// --- hivemodels tool ---
server.tool(
  "hivemodels",
  "List OpenCode models currently available as Hive clients. Use this when selecting opencode:<provider/model> clients.",
  {
    provider: z.string().optional().describe(
      "Optional OpenCode provider ID to filter by, for example opencode-go, openai, minimax, or zai-coding-plan."
    ),
    refresh: z.boolean().optional().describe(
      "Ask OpenCode to refresh its model cache before listing models."
    ),
  },
  async (params) => {
    const args: string[] = [];
    if (params.provider) args.push(params.provider);
    if (params.refresh) args.push("--refresh");

    const result = listOpenCodeModels(args);
    if (!result.available) {
      return {
        content: [{ type: "text" as const, text: `OpenCode model discovery failed: ${result.error ?? "unknown error"}` }],
        isError: true,
      };
    }

    const text = result.clients.length > 0
      ? `OpenCode models available as Hive clients (${result.clients.length}):\n\n${result.clients.map(c => `- ${c}`).join("\n")}`
      : "No OpenCode models were returned.";

    return {
      content: [{ type: "text" as const, text }],
      isError: false,
    };
  }
);

// --- hivejob tool ---
server.tool(
  "hivejob",
  "Check, fetch, list, collect, or cancel Hive background jobs created by long-running hive calls.",
  {
    action: z.enum(["get", "list", "cancel", "collect"]).describe("Job operation to perform. Use collect with run_id to get one compact status/results payload for a multi-job review run."),
    job_id: z.string().optional().describe("Hive job ID returned by hive when a job is still running."),
    run_id: RUN_ID_SCHEMA.optional().describe("Optional run/group ID. Used by list and collect to filter related jobs."),
    include_result: z.boolean().optional().describe("For action=get/collect, include stored completed output. Defaults to true."),
  },
  async (params) => {
    if (params.action === "list") {
      return {
        content: [{ type: "text" as const, text: formatHiveJobList(params.run_id) }],
        isError: false,
      };
    }

    if (params.action === "collect") {
      return {
        content: [{ type: "text" as const, text: formatHiveJobCollection(params.run_id, params.include_result ?? true) }],
        isError: false,
      };
    }

    if (!params.job_id) {
      return {
        content: [{ type: "text" as const, text: `job_id is required for action=${params.action}.` }],
        isError: true,
      };
    }

    if (params.action === "cancel") {
      const result = cancelHiveJob(params.job_id);
      return {
        content: [{ type: "text" as const, text: result.job ? `${result.message}\n\n${formatHiveJob(result.job, false)}` : result.message }],
        isError: !result.ok,
      };
    }

    const job = getHiveJob(params.job_id);
    if (!job) {
      return {
        content: [{ type: "text" as const, text: `No Hive job found for id "${params.job_id}".` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text" as const, text: formatHiveJob(job, params.include_result ?? true) }],
      isError: job.status === "failed" || job.status === "cancelled" || job.result?.isError === true,
    };
  }
);

// --- hive tool — register when clients are available, or when
// dynamic OpenCode model clients can be addressed explicitly.
if (available.length >= 1 || supportsOpenCodeModelClients()) {
server.tool(
  "hivepick",
  "Spawn one or more CLI agents after asking which models/clients to use. This is a compatibility tool for hosts that cache or require the hive.clients parameter.",
  {
    prompt: z.string().describe("The task or question to send to all CLI agents"),
    role: z.string().optional().describe(
      "Role-based system prompt to apply to all agents. Options: default, reviewer, debugger, planner, thinker, analyst, refactor, testgen, secaudit, docgen, precommit, challenger, apilookup, tracer"
    ),
    continuation_id: z.string().optional().describe(
      "Thread ID for a single-client run. Ignored for multi-client runs."
    ),
    cwd: z.string().optional().describe(
      "Working directory for all CLI processes. Defaults to server's cwd."
    ),
    timeout_seconds: z.number().int().min(1).max(7200).optional().describe(
      "Per-call timeout for each CLI process in seconds. Overrides client defaults."
    ),
    background: z.boolean().optional().describe(
      "Start the multi-agent run as a background job and return a job ID immediately. Use hivejob to fetch or cancel it."
    ),
    wait_seconds: z.number().int().min(0).max(300).optional().describe(
      `How long to wait for all agents before returning a background job ID. Default ${DEFAULT_SYNC_WAIT_SECONDS}s. Use 0 for immediate background.`
    ),
    run_id: RUN_ID_SCHEMA.optional().describe(
      "Optional run/group ID shared by related Hive jobs. Use hivejob action=collect with this run_id for progress."
    ),
  },
  async (params, extra) => {
    try {
      const onProgress = createProgressCallback(extra);
      const resolvedClients = await resolveConsensusClients(undefined, extra);

      const summary: HiveJobSummary = {
        run_id: params.run_id,
        clients: resolvedClients,
        role: params.role ?? "default",
        cwd: params.cwd,
        timeout_seconds: params.timeout_seconds,
        prompt_chars: params.prompt.length,
      };
      const job = startHiveJob("hive", summary, async (signal) => {
        if (resolvedClients.length === 1) {
          const result = await handleHive({
            client: resolvedClients[0],
            prompt: params.prompt,
            role: params.role,
            continuation_id: params.continuation_id,
            cwd: params.cwd,
            timeout_seconds: params.timeout_seconds,
          }, onProgress, signal);
          return singleResultToToolResult(result);
        }
        const result = await handleConsensus({
          clients: resolvedClients,
          prompt: params.prompt,
          role: params.role,
          cwd: params.cwd,
          timeout_seconds: params.timeout_seconds,
        }, onProgress, signal);
        return consensusResultToToolResult(result);
      });

      const waitSeconds = params.background ? 0 : clampWaitSeconds(params.wait_seconds);
      return await waitForToolJob(job.id, waitSeconds, extra.signal, !params.background);
    } catch (err) {
      if (err instanceof ClientResolutionError) {
        return {
          content: [{ type: "text" as const, text: err.message }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: `Internal server error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "hive",
  "Spawn one or more CLI agents with the same prompt. A single client returns a single-agent response; multiple clients run in parallel and return a consensus-style response. " +
  `If clients are omitted, Hive asks which model(s) to use. Use this to delegate tasks to external AI CLIs that have full tool access.`,
  {
    clients: z.array(z.string()).min(1).optional().describe(
      `CLI clients to query. Pass one client for a single-agent run or multiple for parallel consensus. Omit to choose from ranked available models/clients. If a host requires this field, pass ["${MODEL_SELECTION_SENTINEL}"] or use hivepick. Available: ${availablePreview}.${openCodeModelHint}`
    ),
    prompt: z.string().describe("The task or question to send to all CLI agents"),
    role: z.string().optional().describe(
      "Role-based system prompt to apply to all agents. Options: default, reviewer, debugger, planner, thinker, analyst, refactor, testgen, secaudit, docgen, precommit, challenger, apilookup, tracer"
    ),
    continuation_id: z.string().optional().describe(
      "Thread ID for a single-client run. Ignored for multi-client runs."
    ),
    cwd: z.string().optional().describe(
      "Working directory for all CLI processes. Defaults to server's cwd."
    ),
    timeout_seconds: z.number().int().min(1).max(7200).optional().describe(
      "Per-call timeout for each CLI process in seconds. Overrides client defaults."
    ),
    background: z.boolean().optional().describe(
      "Start the multi-agent run as a background job and return a job ID immediately. Use hivejob to fetch or cancel it."
    ),
    wait_seconds: z.number().int().min(0).max(300).optional().describe(
      `How long to wait for all agents before returning a background job ID. Default ${DEFAULT_SYNC_WAIT_SECONDS}s. Use 0 for immediate background.`
    ),
    run_id: RUN_ID_SCHEMA.optional().describe(
      "Optional run/group ID shared by related Hive jobs. Use hivejob action=collect with this run_id for progress."
    ),
  },
  async (params, extra) => {
    try {
      const onProgress = createProgressCallback(extra);
      const resolvedClients = await resolveConsensusClients(params.clients, extra);

      const summary: HiveJobSummary = {
        run_id: params.run_id,
        clients: resolvedClients,
        role: params.role ?? "default",
        cwd: params.cwd,
        timeout_seconds: params.timeout_seconds,
        prompt_chars: params.prompt.length,
      };
      const job = startHiveJob("hive", summary, async (signal) => {
        if (resolvedClients.length === 1) {
          const result = await handleHive({
            client: resolvedClients[0],
            prompt: params.prompt,
            role: params.role,
            continuation_id: params.continuation_id,
            cwd: params.cwd,
            timeout_seconds: params.timeout_seconds,
          }, onProgress, signal);
          return singleResultToToolResult(result);
        }
        const result = await handleConsensus({
          clients: resolvedClients,
          prompt: params.prompt,
          role: params.role,
          cwd: params.cwd,
          timeout_seconds: params.timeout_seconds,
        }, onProgress, signal);
        return consensusResultToToolResult(result);
      });

      const waitSeconds = params.background ? 0 : clampWaitSeconds(params.wait_seconds);
      return await waitForToolJob(job.id, waitSeconds, extra.signal, !params.background);
    } catch (err) {
      if (err instanceof ClientResolutionError) {
        return {
          content: [{ type: "text" as const, text: err.message }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: `Internal server error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);
} // end if consensus tool should be registered

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`[hive] Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
