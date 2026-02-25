import { Parser } from "./base.js";

// Strip ANSI escape sequences and terminal control codes from kilo output
const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[\?]?[0-9;]*[a-zA-Z]/g;

/**
 * Kilo Code `--auto --json` output format: JSONL with ANSI escape codes
 *
 * Key event types:
 * - {"say":"completion_result","partial":false,"content":"answer"} — final answer (content or metadata)
 * - {"say":"text","partial":false,"content":"..."} — text output
 * - {"say":"reasoning",...} — reasoning text
 *
 * Kilo puts the value in either `content` or `metadata` depending on the response.
 * Priority: completion_result > last non-partial text
 */
export class KiloParser implements Parser {
  parse(stdout: string, _stderr: string): string {
    const trimmed = stdout.trim();
    if (!trimmed) return "";

    // Strip ANSI codes
    const clean = trimmed.replace(ANSI_RE, "");

    const lines = clean.split("\n");
    let completionResult: string | undefined;
    let lastText: string | undefined;

    for (const line of lines) {
      const stripped = line.trim();
      if (!stripped) continue;

      try {
        const obj = JSON.parse(stripped);
        if (obj?.partial !== false) continue;

        const value = this.extractValue(obj);
        if (!value) continue;

        if (obj?.say === "completion_result") {
          completionResult = value;
        } else if (obj?.say === "text" && obj?.source === "extension") {
          lastText = value;
        }
      } catch {
        // Skip unparseable lines
      }
    }

    return completionResult ?? lastText ?? "";
  }

  /** Extract the response value — kilo puts it in content or metadata */
  private extractValue(obj: any): string | undefined {
    if (typeof obj?.content === "string" && obj.content.trim()) {
      return obj.content;
    }
    if (obj?.metadata !== undefined && obj?.metadata !== null) {
      const val = String(obj.metadata);
      if (val.trim()) return val;
    }
    return undefined;
  }
}
