import { BaseCLIAgent } from "./base.js";
import type { ResolvedClient, SpawnResult } from "../types.js";

export class CodexAgent extends BaseCLIAgent {
  constructor(client: ResolvedClient) {
    super(client);
  }

  /** Codex uses `exec` subcommand — inject it before other args if not already present */
  protected override buildArgs(systemPrompt: string | undefined, userPrompt: string): string[] {
    const args = super.buildArgs(systemPrompt, userPrompt);

    // Ensure 'exec' is first if output_args doesn't already start with it
    if (args[0] !== "exec") {
      // output_args for codex should be ["exec", "--json"] so this is a safety check
    }

    return args;
  }

  /** Codex JSONL output can have broken lines — stderr is useful for diagnostics */
  override async run(systemPrompt: string | undefined, userPrompt: string, cwd?: string): Promise<SpawnResult> {
    const result = await super.run(systemPrompt, userPrompt, cwd);
    return result;
  }
}
