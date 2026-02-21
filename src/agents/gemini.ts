import { BaseCLIAgent } from "./base.js";
import type { ResolvedClient, SpawnResult } from "../types.js";

export class GeminiAgent extends BaseCLIAgent {
  constructor(client: ResolvedClient) {
    super(client);
  }

  /**
   * Gemini uses -p for headless mode. When both -p and stdin are provided,
   * -p gives the instruction and stdin provides content.
   *
   * Strategy:
   * - System prompt → -p flag (instructions)
   * - User prompt → stdin (content, no arg length limit)
   * - No system prompt → -p with user prompt directly
   */
  protected override buildArgs(systemPrompt: string | undefined, userPrompt: string): string[] {
    const args: string[] = [...this.client.output_args, ...this.client.additional_args];

    if (systemPrompt) {
      // System prompt as -p instruction, user prompt goes via stdin
      args.push("-p", systemPrompt);
    } else {
      // No system prompt — use -p for headless mode with short prompt,
      // or stdin for long prompts to avoid arg length limits
      if (userPrompt.length < 50_000) {
        args.push("-p", userPrompt);
      } else {
        // Long prompt — -p with minimal instruction, full prompt via stdin
        args.push("-p", "Process the following input:");
      }
    }

    return args;
  }

  /**
   * Stdin carries the user prompt when system prompt is in -p,
   * or empty when user prompt is short enough for -p.
   */
  protected override buildStdin(systemPrompt: string | undefined, userPrompt: string): string {
    if (systemPrompt) {
      // System prompt is in -p, user prompt goes here
      return userPrompt;
    }
    // No system prompt — if short, it went in -p; if long, it goes here
    if (userPrompt.length < 50_000) {
      return "";
    }
    return userPrompt;
  }

  /** Filter known Gemini stderr noise */
  override async run(systemPrompt: string | undefined, userPrompt: string, cwd?: string): Promise<SpawnResult> {
    const result = await super.run(systemPrompt, userPrompt, cwd);

    if (result.stderr) {
      result.stderr = result.stderr
        .split("\n")
        .filter(line => !line.includes("WARNING") && !line.includes("I/O"))
        .join("\n")
        .trim();
    }

    return result;
  }
}
