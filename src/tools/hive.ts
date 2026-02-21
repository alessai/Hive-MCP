import type { AgentRequest, AgentResponse, ProgressCallback } from "../types.js";
import { getClient, listClients } from "../config/registry.js";
import { createAgent } from "../agents/factory.js";
import { getParser } from "../parsers/index.js";
import { loadSystemPrompt } from "../prompts/loader.js";
import { getThread, createThread, addTurn, buildContext } from "../continuation/store.js";

export async function handleHive(request: AgentRequest, onProgress?: ProgressCallback): Promise<AgentResponse> {
  const startTime = Date.now();
  const role = request.role ?? "default";

  try {
    // Resolve client
    const client = getClient(request.client);
    if (!client) {
      return {
        client: request.client,
        role,
        success: false,
        response: "",
        error: `Unknown client "${request.client}". Available: ${listClients().join(", ")}`,
        duration_ms: Date.now() - startTime,
        truncated: false,
      };
    }

    // Build user prompt with continuation context
    let userPrompt = request.prompt;
    if (request.continuation_id) {
      const context = await buildContext(request.continuation_id);
      if (context) {
        userPrompt = `${context}\n\n---\n\n${request.prompt}`;
      }
    }

    // Load role system prompt (template without {{PROMPT}} placeholder).
    // For flag-based CLIs (Claude): goes via --append-system-prompt flag
    // For stdin-based CLIs (Gemini, Codex): prepended to userPrompt by BaseCLIAgent.buildStdin
    const systemPrompt = loadSystemPrompt(role);

    // Spawn agent
    await onProgress?.(`Spawning ${request.client} CLI...`, 0, 100);
    const agent = createAgent(client);
    const spawnResult = await agent.run(
      systemPrompt ?? undefined,
      userPrompt,
      request.cwd,
      onProgress,
    );

    // Parse output
    await onProgress?.(`Parsing ${request.client} output...`, 90, 100);
    const parser = getParser(client.parser);
    let response: string;
    try {
      response = parser.parse(spawnResult.stdout, spawnResult.stderr);
    } catch {
      response = spawnResult.stdout.trim() || spawnResult.stderr.trim() || "(no output)";
    }

    // Fall back to stderr if parser returned empty but stderr has content
    if (!response && spawnResult.stderr.trim()) {
      response = spawnResult.stderr.trim();
    }
    if (!response) {
      response = "(no output)";
    }

    // Truncate if needed
    const truncated = response.length > 20_000;
    if (truncated) {
      response = response.slice(0, 20_000) + "\n\n[Output truncated]";
    }

    // Determine success
    const success = !spawnResult.timedOut && spawnResult.exitCode === 0;

    // Build error message if needed
    let error: string | undefined;
    if (spawnResult.timedOut) {
      error = `Process timed out after ${client.timeout_seconds}s`;
    } else if (spawnResult.exitCode !== 0) {
      error = `Process exited with code ${spawnResult.exitCode}`;
      if (spawnResult.stderr.trim()) {
        error += `: ${spawnResult.stderr.trim().slice(0, 500)}`;
      }
    }

    // Store continuation turns only on success — failed responses pollute context
    if (request.continuation_id && success) {
      if (!await getThread(request.continuation_id)) {
        await createThread(request.continuation_id);
      }
      await addTurn(request.continuation_id, {
        role: "user",
        content: request.prompt,
        client: request.client,
        timestamp: startTime,
      });
      await addTurn(request.continuation_id, {
        role: "assistant",
        content: response,
        client: request.client,
        timestamp: Date.now(),
      });
    }

    return {
      client: request.client,
      role,
      success,
      response,
      error,
      duration_ms: Date.now() - startTime,
      truncated,
    };
  } catch (err) {
    return {
      client: request.client,
      role,
      success: false,
      response: "",
      error: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: Date.now() - startTime,
      truncated: false,
    };
  }
}
