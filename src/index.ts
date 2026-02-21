import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { handleHive } from "./tools/hive.js";
import { handleConsensus } from "./tools/hive-consensus.js";
import { listClients, loadAllClients } from "./config/registry.js";

const server = new McpServer({
  name: "hive",
  version: "1.0.0",
});

// Load all CLI client configs on startup
loadAllClients();

// --- hive tool ---
server.tool(
  "hive",
  "Spawn a single CLI agent (Gemini, Claude, Codex, or custom) with an optional role-specific system prompt. " +
  "Use this to delegate tasks to external AI CLIs that have full tool access (file system, web search, etc).",
  {
    client: z.string().describe(
      `CLI client to use. Available: ${listClients().join(", ")}`
    ),
    prompt: z.string().describe("The task or question to send to the CLI agent"),
    role: z.string().optional().describe(
      "Role-based system prompt to apply. Options: default, reviewer, debugger, planner, thinker, analyst, refactor, testgen, secaudit, docgen, precommit, challenger, apilookup, tracer"
    ),
    continuation_id: z.string().optional().describe(
      "Thread ID for multi-turn conversations. Reuse the same ID to maintain context across calls."
    ),
    cwd: z.string().optional().describe(
      "Working directory for the CLI process. Defaults to server's cwd."
    ),
  },
  async (params) => {
    try {
      const result = await handleHive({
        client: params.client,
        prompt: params.prompt,
        role: params.role,
        continuation_id: params.continuation_id,
        cwd: params.cwd,
      });

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
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Internal server error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// --- hive_consensus tool ---
server.tool(
  "hive_consensus",
  "Spawn 2+ CLI agents in parallel with the same prompt, collect all responses for comparison. " +
  "Use this to get diverse perspectives or validate answers across multiple AI models.",
  {
    clients: z.array(z.string()).min(2).describe(
      `CLI clients to query in parallel. Available: ${listClients().join(", ")}`
    ),
    prompt: z.string().describe("The task or question to send to all CLI agents"),
    role: z.string().optional().describe(
      "Role-based system prompt to apply to all agents. Options: default, reviewer, debugger, planner, thinker, analyst, refactor, testgen, secaudit, docgen, precommit, challenger, apilookup, tracer"
    ),
    cwd: z.string().optional().describe(
      "Working directory for all CLI processes. Defaults to server's cwd."
    ),
  },
  async (params) => {
    try {
      const result = await handleConsensus({
        clients: params.clients,
        prompt: params.prompt,
        role: params.role,
        cwd: params.cwd,
      });

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
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Internal server error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
