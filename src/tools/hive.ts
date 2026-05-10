import type { AgentRequest, AgentResponse, ProgressCallback } from "../types.js";
import { getClient, listClients, opencodeModelClientHint } from "../config/registry.js";
import { createAgent } from "../agents/factory.js";
import { getParser, ParserError } from "../parsers/index.js";
import { loadSystemPrompt } from "../prompts/loader.js";
import { getThread, createThread, addTurn, buildContext } from "../continuation/store.js";
import { DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS } from "../config/constants.js";
import { log } from "../log.js";
import { recordClientUse } from "../models/usage.js";

function clampTimeout(timeout: number | undefined, fallback: number): number {
  const value = timeout ?? fallback ?? DEFAULT_TIMEOUT_SECONDS;
  return Math.min(Math.max(1, Math.floor(value)), MAX_TIMEOUT_SECONDS);
}

export async function handleHive(request: AgentRequest, onProgress?: ProgressCallback, signal?: AbortSignal): Promise<AgentResponse> {
  const startTime = Date.now();
  const role = request.role ?? "default";
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  try {
    // Resolve client
    const client = getClient(request.client);
    if (!client) {
      return {
        client: request.client,
        role,
        success: false,
        response: "",
        error: `Unknown client "${request.client}". Available: ${listClients().join(", ")}. OpenCode model clients can be addressed as ${opencodeModelClientHint()} (example: opencode:openai/gpt-5.5).`,
        duration_ms: Date.now() - startTime,
        truncated: false,
      };
    }

    const timeoutSeconds = clampTimeout(request.timeout_seconds, client.timeout_seconds);
    const runClient = timeoutSeconds === client.timeout_seconds
      ? client
      : { ...client, timeout_seconds: timeoutSeconds };
    await recordClientUse(request.client);

    log(`[${request.client}] Request started`, "INFO", {
      request_id: requestId,
      role,
      cwd: request.cwd ?? process.cwd(),
      timeout_seconds: timeoutSeconds,
      prompt_chars: request.prompt.length,
      prompt_preview: process.env.HIVE_LOG_PROMPTS === "1" ? request.prompt.slice(0, 500) : undefined,
    });

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
    const agent = createAgent(runClient);
    const spawnResult = await agent.run(
      systemPrompt ?? undefined,
      userPrompt,
      request.cwd,
      onProgress,
      signal,
    );

    // Parse output
    await onProgress?.(`Parsing ${request.client} output...`, 90, 100);
    const parser = getParser(runClient.parser);
    let response: string;
    let parserError: string | undefined;
    try {
      response = parser.parse(spawnResult.stdout, spawnResult.stderr);
    } catch (err) {
      if (err instanceof ParserError) {
        parserError = err.message;
        log(`[${request.client}] Parser reported model/CLI error`, "WARN", {
          request_id: requestId,
          parser: runClient.parser,
          error: err.message,
        });
      } else {
        log(`[${request.client}] Parser failed; falling back to raw output`, "WARN", {
          request_id: requestId,
          parser: runClient.parser,
          error: err instanceof Error ? err.message : String(err),
        });
      }
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
    const success = !spawnResult.timedOut && !spawnResult.aborted && spawnResult.exitCode === 0 && !parserError;

    // Build error message if needed
    let error: string | undefined;
    if (parserError) {
      error = parserError;
    } else if (spawnResult.aborted) {
      error = `Process aborted before completion. Captured ${spawnResult.stdout.length} stdout chars and ${spawnResult.stderr.length} stderr chars before termination.`;
    } else if (spawnResult.timedOut) {
      error = `Process timed out after ${timeoutSeconds}s. Captured ${spawnResult.stdout.length} stdout chars and ${spawnResult.stderr.length} stderr chars before termination.`;
    } else if (spawnResult.exitCode !== 0) {
      error = `Process exited with code ${spawnResult.exitCode}`;
      if (spawnResult.stderr.trim()) {
        error += `: ${spawnResult.stderr.trim().slice(0, 500)}`;
      }
    }

    log(`[${request.client}] Request finished`, success ? "INFO" : "WARN", {
      request_id: requestId,
      role,
      success,
      duration_ms: Date.now() - startTime,
      timed_out: spawnResult.timedOut,
      aborted: spawnResult.aborted ?? false,
      exit_code: spawnResult.exitCode,
      response_chars: response.length,
      truncated,
      error,
    });

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
