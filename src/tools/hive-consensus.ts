import type { ConsensusRequest, ConsensusResponse, AgentRequest } from "../types.js";
import { handleHive } from "./hive.js";

export async function handleConsensus(request: ConsensusRequest): Promise<ConsensusResponse> {
  const role = request.role ?? "default";

  // Spawn all CLIs in parallel
  const promises = request.clients.map(client => {
    const agentRequest: AgentRequest = {
      client,
      role,
      prompt: request.prompt,
      cwd: request.cwd,
    };
    return handleHive(agentRequest).catch((err): ReturnType<typeof handleHive> extends Promise<infer T> ? T : never => ({
      client,
      role,
      success: false,
      response: "",
      error: `Internal error: ${err instanceof Error ? err.message : String(err)}`,
      duration_ms: 0,
      truncated: false,
    }));
  });

  const responses = await Promise.all(promises);

  // Build structural summary
  const succeeded = responses.filter(r => r.success);
  const failed = responses.filter(r => !r.success);

  let summary = `Consensus query completed: ${succeeded.length}/${responses.length} agents responded successfully.`;
  if (failed.length > 0) {
    summary += ` Failed: ${failed.map(r => `${r.client} (${r.error})`).join(", ")}.`;
  }

  // Format individual responses with headers
  const formattedResponses = responses.map(r => ({
    ...r,
    response: r.success
      ? r.response
      : `[ERROR] ${r.error ?? "Unknown error"}\n${r.response}`,
  }));

  return {
    prompt: request.prompt,
    role,
    responses: formattedResponses,
    summary,
  };
}
