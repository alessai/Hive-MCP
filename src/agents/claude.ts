import { BaseCLIAgent } from "./base.js";
import type { ResolvedClient } from "../types.js";

export class ClaudeAgent extends BaseCLIAgent {
  constructor(client: ResolvedClient) {
    super(client);
  }

  /** Claude uses --append-system-prompt flag for system prompt injection, user prompt via stdin */
  protected override buildArgs(systemPrompt: string | undefined, userPrompt: string): string[] {
    const args: string[] = [...this.client.output_args, ...this.client.additional_args];

    if (systemPrompt && this.client.prompt_flag) {
      args.push(this.client.prompt_flag, systemPrompt);
    }

    return args;
  }

  /** Claude gets user prompt via stdin only (system prompt goes via flag) */
  protected override buildStdin(systemPrompt: string | undefined, userPrompt: string): string {
    return userPrompt;
  }
}
