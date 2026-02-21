import { Parser, ParserError } from "./base.js";

export class ClaudeParser implements Parser {
  parse(stdout: string, _stderr: string): string {
    const trimmed = stdout.trim();
    if (!trimmed) return "";

    try {
      const parsed = JSON.parse(trimmed);

      // Single JSON object with a result field
      if (!Array.isArray(parsed)) {
        if (typeof parsed?.result === "string") {
          if (parsed.is_error) {
            throw new ParserError(`Claude returned error: ${parsed.result}`, "claude", trimmed);
          }
          return parsed.result;
        }
        return trimmed;
      }

      // Array of event objects — find the last result event
      for (let i = parsed.length - 1; i >= 0; i--) {
        const event = parsed[i];
        if (event?.type === "result" && typeof event?.result === "string") {
          if (event.is_error) {
            throw new ParserError(`Claude returned error: ${event.result}`, "claude", trimmed);
          }
          return event.result;
        }
      }

      return trimmed;
    } catch (err) {
      if (err instanceof ParserError) throw err;
      return trimmed;
    }
  }
}
