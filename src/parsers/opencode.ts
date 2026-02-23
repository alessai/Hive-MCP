import { Parser } from "./base.js";

/**
 * OpenCode `run --format json` output: JSONL stream
 * Each line is a JSON object with a `type` field.
 *
 * Key event types:
 * - {"type":"text","part":{"text":"response"}}
 * - {"type":"step_start",...}
 * - {"type":"step_finish",...}
 *
 * We extract text from all events where `type === "text"`.
 */
export class OpenCodeParser implements Parser {
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

        if (
          obj?.type === "text" &&
          typeof obj?.part?.text === "string"
        ) {
          texts.push(obj.part.text);
        }
      } catch {
        // Skip unparseable lines
      }
    }

    return texts.length > 0 ? texts.join("\n") : trimmed;
  }
}
