import { describe, it, expect } from "vitest";
import { INTERNAL_DEFAULTS } from "../src/config/internal-defaults.js";

describe("Internal Defaults", () => {
  it("defines defaults for all 6 runners", () => {
    expect(Object.keys(INTERNAL_DEFAULTS)).toEqual(
      expect.arrayContaining(["gemini", "claude", "codex", "opencode", "qwen", "kilo"])
    );
  });

  it("every default has required fields", () => {
    for (const [name, defaults] of Object.entries(INTERNAL_DEFAULTS)) {
      expect(defaults.parser, `${name} should have parser`).toBeDefined();
      expect(defaults.output_args, `${name} should have output_args`).toBeDefined();
      expect(Array.isArray(defaults.output_args), `${name} output_args should be array`).toBe(true);
      expect(defaults.prompt_injection, `${name} should have prompt_injection`).toMatch(/^(stdin|flag)$/);
      expect(defaults.runner, `${name} should have runner`).toBeDefined();
    }
  });

  it("flag-based runners have prompt_flag", () => {
    for (const [name, defaults] of Object.entries(INTERNAL_DEFAULTS)) {
      if (defaults.prompt_injection === "flag") {
        expect(defaults.prompt_flag, `${name} has flag injection but no prompt_flag`).toBeDefined();
      }
    }
  });

  describe("gemini defaults", () => {
    it("uses gemini parser", () => {
      expect(INTERNAL_DEFAULTS.gemini.parser).toBe("gemini");
    });
    it("injects via flag (-p)", () => {
      expect(INTERNAL_DEFAULTS.gemini.prompt_injection).toBe("flag");
      expect(INTERNAL_DEFAULTS.gemini.prompt_flag).toBe("-p");
    });
    it("outputs json", () => {
      expect(INTERNAL_DEFAULTS.gemini.output_args).toContain("json");
    });
  });

  describe("claude defaults", () => {
    it("uses claude parser", () => {
      expect(INTERNAL_DEFAULTS.claude.parser).toBe("claude");
    });
    it("injects via flag (--append-system-prompt)", () => {
      expect(INTERNAL_DEFAULTS.claude.prompt_injection).toBe("flag");
      expect(INTERNAL_DEFAULTS.claude.prompt_flag).toBe("--append-system-prompt");
    });
    it("has --print and json output", () => {
      const args = INTERNAL_DEFAULTS.claude.output_args;
      expect(args).toContain("--print");
      expect(args).toContain("json");
    });
  });

  describe("codex defaults", () => {
    it("uses codex parser", () => {
      expect(INTERNAL_DEFAULTS.codex.parser).toBe("codex");
    });
    it("injects via stdin", () => {
      expect(INTERNAL_DEFAULTS.codex.prompt_injection).toBe("stdin");
    });
    it("has exec --json", () => {
      const args = INTERNAL_DEFAULTS.codex.output_args;
      expect(args).toContain("exec");
      expect(args).toContain("--json");
    });
  });

  describe("opencode defaults", () => {
    it("uses opencode parser", () => {
      expect(INTERNAL_DEFAULTS.opencode.parser).toBe("opencode");
    });
    it("injects via stdin", () => {
      expect(INTERNAL_DEFAULTS.opencode.prompt_injection).toBe("stdin");
    });
    it("uses base runner", () => {
      expect(INTERNAL_DEFAULTS.opencode.runner).toBe("base");
    });
    it("has run --format json", () => {
      const args = INTERNAL_DEFAULTS.opencode.output_args;
      expect(args).toContain("run");
      expect(args).toContain("--format");
      expect(args).toContain("json");
    });
  });

  describe("qwen defaults", () => {
    it("uses claude parser (same format)", () => {
      expect(INTERNAL_DEFAULTS.qwen.parser).toBe("claude");
    });
    it("injects via stdin", () => {
      expect(INTERNAL_DEFAULTS.qwen.prompt_injection).toBe("stdin");
    });
    it("uses base runner", () => {
      expect(INTERNAL_DEFAULTS.qwen.runner).toBe("base");
    });
    it("has approval mode yolo", () => {
      const args = INTERNAL_DEFAULTS.qwen.output_args;
      expect(args).toContain("--approval-mode");
      expect(args).toContain("yolo");
    });
  });

  describe("kilo defaults", () => {
    it("uses kilo parser", () => {
      expect(INTERNAL_DEFAULTS.kilo.parser).toBe("kilo");
    });
    it("injects via stdin", () => {
      expect(INTERNAL_DEFAULTS.kilo.prompt_injection).toBe("stdin");
    });
    it("uses base runner", () => {
      expect(INTERNAL_DEFAULTS.kilo.runner).toBe("base");
    });
    it("has --auto --json", () => {
      const args = INTERNAL_DEFAULTS.kilo.output_args;
      expect(args).toContain("--auto");
      expect(args).toContain("--json");
    });
  });
});
