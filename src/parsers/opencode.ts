import { Parser, ParserError } from "./base.js";

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

        if (obj?.type === "error") {
          const message = obj?.message ?? obj?.error?.message ?? obj?.error ?? "Unknown OpenCode error";
          throw new ParserError(`OpenCode error: ${message}`, "opencode", trimmed);
        }

        if (
          obj?.type === "text" &&
          typeof obj?.part?.text === "string"
        ) {
          texts.push(obj.part.text);
        }

        // Some OpenCode builds emit message content blocks instead of text events.
        const content = obj?.message?.content ?? obj?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block?.type === "text" && typeof block?.text === "string") {
              texts.push(block.text);
            }
          }
        }
      } catch (err) {
        if (err instanceof ParserError) throw err;
        // Skip unparseable lines, but preserve explicit parser/model errors.
        if (line.includes('"type":"error"') || line.includes('"type": "error"')) {
          throw new ParserError("OpenCode error event could not be parsed", "opencode", trimmed);
        }
      }
    }

    return texts.length > 0 ? texts.join("\n") : trimmed;
  }
}
