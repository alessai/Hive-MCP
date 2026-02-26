import { describe, it, expect, beforeEach } from "vitest";
import { loadAllClients, getClient, listClients } from "../src/config/registry.js";

describe("Client Registry", () => {
  beforeEach(() => {
    // Disable binary detection for unit tests — we test configs, not PATH
    loadAllClients(false);
  });

  it("loads all built-in clients", () => {
    const clients = listClients();
    expect(clients).toContain("gemini");
    expect(clients).toContain("claude");
    expect(clients).toContain("codex");
    expect(clients).toContain("glm");
    expect(clients).toContain("opencode");
    expect(clients).toContain("qwen");
    expect(clients).toContain("kilo");
  });

  it("returns undefined for unknown client", () => {
    expect(getClient("nonexistent")).toBeUndefined();
  });

  // ─── Gemini ──────────────────────────────────────────────

  describe("gemini client", () => {
    it("has correct command and runner", () => {
      const client = getClient("gemini");
      expect(client).toBeDefined();
      expect(client!.command).toBe("gemini");
      expect(client!.runner).toBe("gemini");
    });

    it("uses gemini parser", () => {
      expect(getClient("gemini")!.parser).toBe("gemini");
    });

    it("injects prompt via flag", () => {
      const client = getClient("gemini")!;
      expect(client.prompt_injection).toBe("flag");
      expect(client.prompt_flag).toBe("-p");
    });

    it("has JSON output args", () => {
      expect(getClient("gemini")!.output_args).toContain("-o");
      expect(getClient("gemini")!.output_args).toContain("json");
    });

    it("has model in additional_args", () => {
      expect(getClient("gemini")!.additional_args).toContain("-m");
      expect(getClient("gemini")!.additional_args).toContain("gemini-2.5-pro");
    });
  });

  // ─── Claude ──────────────────────────────────────────────

  describe("claude client", () => {
    it("has correct command and runner", () => {
      const client = getClient("claude");
      expect(client!.command).toBe("claude");
      expect(client!.runner).toBe("claude");
    });

    it("uses claude parser", () => {
      expect(getClient("claude")!.parser).toBe("claude");
    });

    it("injects prompt via flag", () => {
      const client = getClient("claude")!;
      expect(client.prompt_injection).toBe("flag");
      expect(client.prompt_flag).toBe("--append-system-prompt");
    });

    it("has JSON output args", () => {
      const args = getClient("claude")!.output_args;
      expect(args).toContain("--print");
      expect(args).toContain("--output-format");
      expect(args).toContain("json");
    });

    it("has bypassPermissions in additional_args", () => {
      const args = getClient("claude")!.additional_args;
      expect(args).toContain("--permission-mode");
      expect(args).toContain("bypassPermissions");
    });

    it("has 30 min timeout", () => {
      expect(getClient("claude")!.timeout_seconds).toBe(1800);
    });
  });

  // ─── GLM (Claude alias with opus) ────────────────────────

  describe("glm client", () => {
    it("uses claude command", () => {
      expect(getClient("glm")!.command).toBe("claude");
    });

    it("uses claude runner and parser", () => {
      const client = getClient("glm")!;
      expect(client.runner).toBe("claude");
      expect(client.parser).toBe("claude");
    });

    it("has opus model flag", () => {
      const args = getClient("glm")!.additional_args;
      expect(args).toContain("--model");
      expect(args).toContain("opus");
    });
  });

  // ─── Codex ───────────────────────────────────────────────

  describe("codex client", () => {
    it("has correct command and runner", () => {
      const client = getClient("codex")!;
      expect(client.command).toBe("codex");
      expect(client.runner).toBe("codex");
    });

    it("uses codex parser", () => {
      expect(getClient("codex")!.parser).toBe("codex");
    });

    it("injects prompt via stdin", () => {
      expect(getClient("codex")!.prompt_injection).toBe("stdin");
    });

    it("has exec --json output args", () => {
      const args = getClient("codex")!.output_args;
      expect(args).toContain("exec");
      expect(args).toContain("--json");
    });
  });

  // ─── OpenCode ────────────────────────────────────────────

  describe("opencode client", () => {
    it("has correct command and runner", () => {
      const client = getClient("opencode")!;
      expect(client.command).toBe("opencode");
      expect(client.runner).toBe("base");
    });

    it("uses opencode parser", () => {
      expect(getClient("opencode")!.parser).toBe("opencode");
    });

    it("injects prompt via stdin", () => {
      expect(getClient("opencode")!.prompt_injection).toBe("stdin");
    });

    it("has run --format json output args", () => {
      const args = getClient("opencode")!.output_args;
      expect(args).toContain("run");
      expect(args).toContain("--format");
      expect(args).toContain("json");
    });
  });

  // ─── Qwen ────────────────────────────────────────────────

  describe("qwen client", () => {
    it("has correct command and runner", () => {
      const client = getClient("qwen")!;
      expect(client.command).toBe("qwen");
      expect(client.runner).toBe("base");
    });

    it("uses claude parser (same JSON format)", () => {
      expect(getClient("qwen")!.parser).toBe("claude");
    });

    it("injects prompt via stdin", () => {
      expect(getClient("qwen")!.prompt_injection).toBe("stdin");
    });

    it("has approval mode yolo", () => {
      const args = getClient("qwen")!.output_args;
      expect(args).toContain("--approval-mode");
      expect(args).toContain("yolo");
    });
  });

  // ─── Kilo ────────────────────────────────────────────────

  describe("kilo client", () => {
    it("has kilocode command", () => {
      expect(getClient("kilo")!.command).toBe("kilocode");
    });

    it("uses base runner", () => {
      expect(getClient("kilo")!.runner).toBe("base");
    });

    it("uses kilo parser", () => {
      expect(getClient("kilo")!.parser).toBe("kilo");
    });

    it("injects prompt via stdin", () => {
      expect(getClient("kilo")!.prompt_injection).toBe("stdin");
    });

    it("has --auto --json output args", () => {
      const args = getClient("kilo")!.output_args;
      expect(args).toContain("--auto");
      expect(args).toContain("--json");
    });
  });

  // ─── Timeout validation ──────────────────────────────────

  describe("timeout bounds", () => {
    it("all clients have timeout > 0", () => {
      for (const name of listClients()) {
        const client = getClient(name)!;
        expect(client.timeout_seconds).toBeGreaterThan(0);
      }
    });

    it("all clients have timeout <= 7200 (2 hours)", () => {
      for (const name of listClients()) {
        const client = getClient(name)!;
        expect(client.timeout_seconds).toBeLessThanOrEqual(7200);
      }
    });
  });
});
