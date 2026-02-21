import { Parser, ParserError } from "./base.js";

export class ClaudeParser implements Parser {
  parse(stdout: string, _stderr: string): string {
    const trimmed = stdout.trim();
    if (!trimmed) return "";

    // Strategy 1: Try parsing as a single JSON object or array
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
        return this.extractFromObject(parsed) ?? trimmed;
      }

      // Array of event objects — find the last result event
      const result = this.extractFromEvents(parsed);
      if (result !== undefined) return result;

      return trimmed;
    } catch (err) {
      if (err instanceof ParserError) throw err;
      // JSON.parse failed — likely truncated output. Fall through to JSONL parsing.
    }

    // Strategy 2: Parse as JSONL (one JSON object per line) — handles truncated arrays
    // and streaming output where the full array can't be parsed
    return this.parseJsonl(trimmed);
  }

  /** Extract text from a stream of JSONL events, tolerating truncated/broken lines */
  private parseJsonl(raw: string): string {
    // Strip leading '[' if the output was a truncated JSON array
    let input = raw;
    if (input.startsWith("[")) {
      input = input.slice(1);
    }

    const lines = input.split("\n");
    const events: any[] = [];

    for (const line of lines) {
      // Strip trailing comma from array-style output: {...},
      const cleaned = line.replace(/,\s*$/, "").trim();
      if (!cleaned || cleaned === "]") continue;

      try {
        events.push(JSON.parse(cleaned));
      } catch {
        // Broken/truncated line — skip
      }
    }

    // Look for result event (last one wins)
    const result = this.extractFromEvents(events);
    if (result !== undefined) return result;

    // No result event found — extract text from the last assistant message
    const text = this.extractAssistantText(events);
    if (text) return text;

    return "";
  }

  /** Scan events array for the last result event */
  private extractFromEvents(events: any[]): string | undefined {
    for (let i = events.length - 1; i >= 0; i--) {
      const event = events[i];
      if (event?.type === "result" && typeof event?.result === "string") {
        if (event.is_error) {
          throw new ParserError(`Claude returned error: ${event.result}`, "claude", "");
        }
        return event.result;
      }
    }
    return undefined;
  }

  /** Extract text content from assistant message events */
  private extractAssistantText(events: any[]): string {
    const textParts: string[] = [];

    for (const event of events) {
      // Skip non-assistant events (init, user/tool_result, etc.)
      if (event?.type !== "assistant") continue;

      const content = event?.message?.content;
      if (!Array.isArray(content)) continue;

      for (const block of content) {
        if (block?.type === "text" && typeof block?.text === "string") {
          textParts.push(block.text);
        }
      }
    }

    return textParts.join("\n\n");
  }

  /** Try to extract text from a single JSON object that isn't a result event */
  private extractFromObject(obj: any): string | undefined {
    // Assistant message object
    if (obj?.type === "assistant" && Array.isArray(obj?.message?.content)) {
      const texts = obj.message.content
        .filter((b: any) => b?.type === "text" && typeof b?.text === "string")
        .map((b: any) => b.text);
      if (texts.length > 0) return texts.join("\n\n");
    }
    return undefined;
  }
}
