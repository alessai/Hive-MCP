import { describe, it, expect } from "vitest";
import { RawParser } from "../src/parsers/raw.js";
import { GeminiParser } from "../src/parsers/gemini.js";
import { ClaudeParser } from "../src/parsers/claude.js";
import { CodexParser } from "../src/parsers/codex.js";
import { OpenCodeParser } from "../src/parsers/opencode.js";
import { KiloParser } from "../src/parsers/kilo.js";
import { getParser, ParserError } from "../src/parsers/index.js";

// ─── RawParser ───────────────────────────────────────────────

describe("RawParser", () => {
  const parser = new RawParser();

  it("trims whitespace", () => {
    expect(parser.parse("  hello world  ", "")).toBe("hello world");
  });

  it("returns empty string for empty input", () => {
    expect(parser.parse("", "")).toBe("");
    expect(parser.parse("   ", "")).toBe("");
  });

  it("preserves internal whitespace", () => {
    expect(parser.parse("  line1\nline2  ", "")).toBe("line1\nline2");
  });
});

// ─── GeminiParser ────────────────────────────────────────────

describe("GeminiParser", () => {
  const parser = new GeminiParser();

  it("extracts response field from JSON", () => {
    const json = JSON.stringify({ response: "Hello from Gemini", stats: {} });
    expect(parser.parse(json, "")).toBe("Hello from Gemini");
  });

  it("throws ParserError on error field", () => {
    const json = JSON.stringify({
      error: { type: "rate_limit", message: "Rate limited" },
    });
    expect(() => parser.parse(json, "")).toThrow(ParserError);
    expect(() => parser.parse(json, "")).toThrow("Gemini error: Rate limited");
  });

  it("throws ParserError when error has no message, uses type", () => {
    const json = JSON.stringify({ error: { type: "unknown" } });
    expect(() => parser.parse(json, "")).toThrow("Gemini error: unknown");
  });

  it("returns raw output for non-JSON", () => {
    expect(parser.parse("plain text output", "")).toBe("plain text output");
  });

  it("returns raw JSON if response field is not a string", () => {
    const json = JSON.stringify({ data: 42 });
    expect(parser.parse(json, "")).toBe(json);
  });

  it("returns empty string for empty input", () => {
    expect(parser.parse("", "")).toBe("");
    expect(parser.parse("   ", "")).toBe("");
  });
});

// ─── ClaudeParser ────────────────────────────────────────────

describe("ClaudeParser", () => {
  const parser = new ClaudeParser();

  it("extracts result from single JSON object", () => {
    const json = JSON.stringify({ result: "Claude says hello" });
    expect(parser.parse(json, "")).toBe("Claude says hello");
  });

  it("throws ParserError on is_error flag", () => {
    const json = JSON.stringify({ result: "Something went wrong", is_error: true });
    expect(() => parser.parse(json, "")).toThrow(ParserError);
    expect(() => parser.parse(json, "")).toThrow("Claude returned error");
  });

  it("extracts result from event array", () => {
    const events = [
      { type: "init", version: "1" },
      { type: "assistant", message: { content: [{ type: "text", text: "thinking..." }] } },
      { type: "result", result: "Final answer" },
    ];
    expect(parser.parse(JSON.stringify(events), "")).toBe("Final answer");
  });

  it("extracts last result event when multiple exist", () => {
    const events = [
      { type: "result", result: "first" },
      { type: "result", result: "second" },
    ];
    expect(parser.parse(JSON.stringify(events), "")).toBe("second");
  });

  it("extracts assistant text when no result event (JSONL format)", () => {
    // As JSONL (one object per line), the parser falls through to extractAssistantText
    const jsonl = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Part 1" }] } }),
      JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Part 2" }] } }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("Part 1\n\nPart 2");
  });

  it("handles JSONL (truncated array) format", () => {
    const jsonl = [
      JSON.stringify({ type: "init", version: "1" }),
      JSON.stringify({ type: "result", result: "JSONL answer" }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("JSONL answer");
  });

  it("handles truncated JSON array with leading bracket", () => {
    const lines = [
      '[{"type":"init","version":"1"},',
      '{"type":"result","result":"Truncated array"}',
    ].join("\n");
    expect(parser.parse(lines, "")).toBe("Truncated array");
  });

  it("extracts from single assistant message object", () => {
    const obj = {
      type: "assistant",
      message: { content: [{ type: "text", text: "Assistant message" }] },
    };
    expect(parser.parse(JSON.stringify(obj), "")).toBe("Assistant message");
  });

  it("returns empty string for non-JSON non-JSONL input", () => {
    // "plain text" can't be parsed as JSON or JSONL, so parseJsonl returns ""
    expect(parser.parse("plain text", "")).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(parser.parse("", "")).toBe("");
  });

  it("throws on error in event array", () => {
    const events = [
      { type: "result", result: "Error happened", is_error: true },
    ];
    expect(() => parser.parse(JSON.stringify(events), "")).toThrow(ParserError);
  });
});

// ─── CodexParser ─────────────────────────────────────────────

describe("CodexParser", () => {
  const parser = new CodexParser();

  it("extracts agent_message from item.completed events", () => {
    const jsonl = [
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Hello from Codex" } }),
      JSON.stringify({ type: "turn.completed" }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("Hello from Codex");
  });

  it("joins multiple agent messages", () => {
    const jsonl = [
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Part 1" } }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Part 2" } }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("Part 1\nPart 2");
  });

  it("skips non-agent_message events", () => {
    const jsonl = [
      JSON.stringify({ type: "item.completed", item: { type: "tool_call", text: "ignore" } }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "Keep this" } }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("Keep this");
  });

  it("returns raw output if no agent_message found", () => {
    const jsonl = JSON.stringify({ type: "turn.completed" });
    expect(parser.parse(jsonl, "")).toBe(jsonl.trim());
  });

  it("returns empty string for empty input", () => {
    expect(parser.parse("", "")).toBe("");
  });

  it("handles mixed valid/invalid lines", () => {
    const jsonl = [
      "not json at all",
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "valid" } }),
      "another bad line",
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("valid");
  });
});

// ─── OpenCodeParser ──────────────────────────────────────────

describe("OpenCodeParser", () => {
  const parser = new OpenCodeParser();

  it("extracts text from type=text events", () => {
    const jsonl = [
      JSON.stringify({ type: "text", part: { text: "Hello from OpenCode" } }),
      JSON.stringify({ type: "step_finish", data: {} }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("Hello from OpenCode");
  });

  it("joins multiple text parts", () => {
    const jsonl = [
      JSON.stringify({ type: "text", part: { text: "Part A" } }),
      JSON.stringify({ type: "text", part: { text: "Part B" } }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("Part A\nPart B");
  });

  it("skips non-text events", () => {
    const jsonl = [
      JSON.stringify({ type: "step_start", data: {} }),
      JSON.stringify({ type: "text", part: { text: "Keep this" } }),
      JSON.stringify({ type: "step_finish", data: {} }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("Keep this");
  });

  it("returns raw output if no text events found", () => {
    const raw = JSON.stringify({ type: "step_finish" });
    expect(parser.parse(raw, "")).toBe(raw);
  });

  it("returns empty string for empty input", () => {
    expect(parser.parse("", "")).toBe("");
  });

  it("handles invalid JSON lines gracefully", () => {
    const jsonl = [
      "broken json {{{",
      JSON.stringify({ type: "text", part: { text: "good" } }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("good");
  });

  it("returns raw if part.text is not a string", () => {
    const jsonl = JSON.stringify({ type: "text", part: { text: 123 } });
    expect(parser.parse(jsonl, "")).toBe(jsonl);
  });
});

// ─── KiloParser ──────────────────────────────────────────────

describe("KiloParser", () => {
  const parser = new KiloParser();

  it("extracts from completion_result event (content field)", () => {
    const jsonl = JSON.stringify({
      say: "completion_result",
      partial: false,
      content: "Kilo's final answer",
    });
    expect(parser.parse(jsonl, "")).toBe("Kilo's final answer");
  });

  it("extracts from completion_result event (metadata field)", () => {
    const jsonl = JSON.stringify({
      say: "completion_result",
      partial: false,
      content: "",
      metadata: "Answer in metadata",
    });
    expect(parser.parse(jsonl, "")).toBe("Answer in metadata");
  });

  it("prefers completion_result over text events", () => {
    const jsonl = [
      JSON.stringify({ say: "text", partial: false, content: "text event", source: "extension" }),
      JSON.stringify({ say: "completion_result", partial: false, content: "completion result" }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("completion result");
  });

  it("falls back to text event if no completion_result", () => {
    const jsonl = [
      JSON.stringify({ say: "reasoning", partial: false, content: "reasoning..." }),
      JSON.stringify({ say: "text", partial: false, content: "text answer", source: "extension" }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("text answer");
  });

  it("strips ANSI escape codes", () => {
    const ansi = "\x1b[32m"; // green
    const reset = "\x1b[0m";
    const jsonl = `${ansi}${JSON.stringify({
      say: "completion_result",
      partial: false,
      content: "clean answer",
    })}${reset}`;
    expect(parser.parse(jsonl, "")).toBe("clean answer");
  });

  it("skips partial events", () => {
    const jsonl = [
      JSON.stringify({ say: "completion_result", partial: true, content: "partial - skip" }),
      JSON.stringify({ say: "completion_result", partial: false, content: "final" }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("final");
  });

  it("returns empty string for empty input", () => {
    expect(parser.parse("", "")).toBe("");
  });

  it("returns empty string when no parseable events", () => {
    expect(parser.parse("random garbage\nnot json", "")).toBe("");
  });

  it("handles numeric metadata", () => {
    const jsonl = JSON.stringify({
      say: "completion_result",
      partial: false,
      content: "",
      metadata: 42,
    });
    expect(parser.parse(jsonl, "")).toBe("42");
  });

  it("ignores text events without source=extension", () => {
    const jsonl = [
      JSON.stringify({ say: "text", partial: false, content: "wrong source", source: "other" }),
    ].join("\n");
    expect(parser.parse(jsonl, "")).toBe("");
  });

  it("strips complex ANSI sequences (OSC, CSI)", () => {
    const osc = "\x1b]0;title\x07";
    const csi = "\x1b[?25h";
    const jsonl = `${osc}${csi}${JSON.stringify({
      say: "completion_result",
      partial: false,
      content: "survived ansi",
    })}`;
    expect(parser.parse(jsonl, "")).toBe("survived ansi");
  });
});

// ─── getParser factory ───────────────────────────────────────

describe("getParser", () => {
  it("returns GeminiParser for 'gemini'", () => {
    expect(getParser("gemini")).toBeInstanceOf(GeminiParser);
  });

  it("returns ClaudeParser for 'claude'", () => {
    expect(getParser("claude")).toBeInstanceOf(ClaudeParser);
  });

  it("returns CodexParser for 'codex'", () => {
    expect(getParser("codex")).toBeInstanceOf(CodexParser);
  });

  it("returns OpenCodeParser for 'opencode'", () => {
    expect(getParser("opencode")).toBeInstanceOf(OpenCodeParser);
  });

  it("returns KiloParser for 'kilo'", () => {
    expect(getParser("kilo")).toBeInstanceOf(KiloParser);
  });

  it("returns RawParser for 'raw'", () => {
    expect(getParser("raw")).toBeInstanceOf(RawParser);
  });

  it("returns RawParser for unknown parser names", () => {
    expect(getParser("nonexistent")).toBeInstanceOf(RawParser);
  });
});
