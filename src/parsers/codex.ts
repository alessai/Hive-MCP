import { Parser } from "./base.js";

/**
 * Codex CLI `exec --json` output format: JSONL stream
 * Each line is a JSON object with a `type` field.
 *
 * Key event types:
 * - {"type":"item.completed","item":{"type":"agent_message","text":"response"}}
 * - {"type":"turn.completed",...}
 * - {"type":"error","message":"..."}
 *
 * We extract text from all `item.completed` events where `item.type === "agent_message"`.
 */
export class CodexParser implements Parser {
  parse(stdout: string, _stderr: string): string {
    const trimmed = stdout.trim();
    if (!trimmed) return "";

    const lines = trimmed.split("\n");
    const texts: string[] = [];

    for (const line of lines) {
      const stripped = line.trim();
      if (!stripped) continue;

      try {
        const obj = JSON.parse(stripped);

        // Extract agent messages from item.completed events
        if (
          obj?.type === "item.completed" &&
          obj?.item?.type === "agent_message" &&
          typeof obj.item.text === "string"
        ) {
          texts.push(obj.item.text);
        }
      } catch {
        // Skip unparseable lines
      }
    }

    return texts.length > 0 ? texts.join("\n") : trimmed;
  }
}
