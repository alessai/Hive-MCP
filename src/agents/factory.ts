import type { ResolvedClient } from "../types.js";
import { BaseCLIAgent } from "./base.js";
import { GeminiAgent } from "./gemini.js";
import { ClaudeAgent } from "./claude.js";
import { CodexAgent } from "./codex.js";

export function createAgent(client: ResolvedClient): BaseCLIAgent {
  switch (client.runner) {
    case "gemini":
      return new GeminiAgent(client);
    case "claude":
      return new ClaudeAgent(client);
    case "codex":
      return new CodexAgent(client);
    default:
      return new BaseCLIAgent(client);
  }
}
