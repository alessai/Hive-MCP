import { Parser } from "./base.js";
import { GeminiParser } from "./gemini.js";
import { ClaudeParser } from "./claude.js";
import { CodexParser } from "./codex.js";
import { OpenCodeParser } from "./opencode.js";
import { KiloParser } from "./kilo.js";
import { RawParser } from "./raw.js";

export { Parser, ParserError } from "./base.js";
export { GeminiParser } from "./gemini.js";
export { ClaudeParser } from "./claude.js";
export { CodexParser } from "./codex.js";
export { OpenCodeParser } from "./opencode.js";
export { KiloParser } from "./kilo.js";
export { RawParser } from "./raw.js";

const parsers: Record<string, () => Parser> = {
  gemini: () => new GeminiParser(),
  claude: () => new ClaudeParser(),
  codex: () => new CodexParser(),
  opencode: () => new OpenCodeParser(),
  kilo: () => new KiloParser(),
  raw: () => new RawParser(),
};

export function getParser(name: string): Parser {
  const factory = parsers[name];
  if (factory) return factory();
  return new RawParser();
}
