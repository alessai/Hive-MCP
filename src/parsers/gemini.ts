import { Parser, ParserError } from "./base.js";

/**
 * Gemini CLI `-o json` output format:
 * {
 *   "response": "the AI response text",
 *   "stats": { "models": {...}, "tools": {...}, "files": {...} },
 *   "error"?: { "type": "...", "message": "...", "code"?: number }
 * }
 */
export class GeminiParser implements Parser {
  parse(stdout: string, _stderr: string): string {
    const trimmed = stdout.trim();
    if (!trimmed) return "";

    try {
      const parsed = JSON.parse(trimmed);

      // Check for error field
      if (parsed?.error) {
        const errMsg = parsed.error.message ?? parsed.error.type ?? "Unknown error";
        throw new ParserError(`Gemini error: ${errMsg}`, "gemini", trimmed);
      }

      // Extract response string
      if (typeof parsed?.response === "string") {
        return parsed.response;
      }

      // Fallback: raw output
      return trimmed;
    } catch (err) {
      if (err instanceof ParserError) throw err;
      // JSON parse failed — return raw text (gemini might have output plain text)
      return trimmed;
    }
  }
}
