import type { InternalDefaults } from "../types.js";

export const INTERNAL_DEFAULTS: Record<string, InternalDefaults> = {
  gemini: {
    parser: "gemini",
    output_args: ["-o", "json"],
    prompt_injection: "flag",
    prompt_flag: "-p",
    runner: "gemini",
  },
  claude: {
    parser: "claude",
    output_args: ["--print", "--output-format", "json", "--no-session-persistence"],
    prompt_injection: "flag",
    prompt_flag: "--append-system-prompt",
    runner: "claude",
  },
  codex: {
    parser: "codex",
    output_args: ["exec", "--json"],
    prompt_injection: "stdin",
    runner: "codex",
  },
  opencode: {
    parser: "opencode",
    output_args: ["run", "--format", "json"],
    prompt_injection: "stdin",
    runner: "base",
  },
  qwen: {
    parser: "claude",
    output_args: ["-o", "json", "--approval-mode", "yolo"],
    prompt_injection: "stdin",
    runner: "base",
  },
  kilo: {
    parser: "kilo",
    output_args: ["--auto", "--json"],
    prompt_injection: "stdin",
    runner: "base",
  },
};
