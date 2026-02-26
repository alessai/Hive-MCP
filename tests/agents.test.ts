import { describe, it, expect } from "vitest";
import { BaseCLIAgent } from "../src/agents/base.js";
import { createAgent } from "../src/agents/factory.js";
import type { ResolvedClient } from "../src/types.js";

function makeClient(overrides: Partial<ResolvedClient> = {}): ResolvedClient {
  return {
    name: "test",
    command: "echo",
    runner: "base",
    parser: "raw",
    output_args: [],
    additional_args: [],
    prompt_injection: "stdin",
    env: {},
    timeout_seconds: 10,
    roles: {},
    ...overrides,
  };
}

describe("BaseCLIAgent", () => {
  describe("buildArgs", () => {
    it("includes output_args and additional_args", () => {
      const client = makeClient({
        output_args: ["-o", "json"],
        additional_args: ["--flag", "value"],
      });
      const agent = new BaseCLIAgent(client);
      const args = (agent as any).buildArgs(undefined, "test prompt");
      expect(args).toEqual(["-o", "json", "--flag", "value"]);
    });

    it("adds system prompt via flag when prompt_injection=flag", () => {
      const client = makeClient({
        prompt_injection: "flag",
        prompt_flag: "--system",
      });
      const agent = new BaseCLIAgent(client);
      const args = (agent as any).buildArgs("system prompt text", "user prompt");
      expect(args).toContain("--system");
      expect(args).toContain("system prompt text");
    });

    it("does not add flag when prompt_injection=stdin", () => {
      const client = makeClient({
        prompt_injection: "stdin",
      });
      const agent = new BaseCLIAgent(client);
      const args = (agent as any).buildArgs("system prompt", "user prompt");
      expect(args).not.toContain("system prompt");
    });

    it("does not add flag when no system prompt", () => {
      const client = makeClient({
        prompt_injection: "flag",
        prompt_flag: "--system",
      });
      const agent = new BaseCLIAgent(client);
      const args = (agent as any).buildArgs(undefined, "user prompt");
      expect(args).not.toContain("--system");
    });
  });

  describe("buildStdin", () => {
    it("prepends system prompt when injection=stdin", () => {
      const client = makeClient({ prompt_injection: "stdin" });
      const agent = new BaseCLIAgent(client);
      const stdin = (agent as any).buildStdin("system prompt", "user prompt");
      expect(stdin).toBe("system prompt\n\nuser prompt");
    });

    it("returns only user prompt when injection=flag", () => {
      const client = makeClient({ prompt_injection: "flag" });
      const agent = new BaseCLIAgent(client);
      const stdin = (agent as any).buildStdin("system prompt", "user prompt");
      expect(stdin).toBe("user prompt");
    });

    it("returns only user prompt when no system prompt", () => {
      const client = makeClient({ prompt_injection: "stdin" });
      const agent = new BaseCLIAgent(client);
      const stdin = (agent as any).buildStdin(undefined, "user prompt");
      expect(stdin).toBe("user prompt");
    });
  });

  describe("run (spawn)", () => {
    it("runs echo and captures stdout", async () => {
      const client = makeClient({ command: "echo", output_args: ["hello world"] });
      const agent = new BaseCLIAgent(client);
      const result = await agent.run(undefined, "");
      expect(result.stdout.trim()).toBe("hello world");
      expect(result.exitCode).toBe(0);
      expect(result.timedOut).toBe(false);
    });

    it("captures stderr", async () => {
      const client = makeClient({
        command: "bash",
        output_args: ["-c", "echo error >&2"],
      });
      const agent = new BaseCLIAgent(client);
      const result = await agent.run(undefined, "");
      expect(result.stderr.trim()).toBe("error");
    });

    it("returns exit code for failing commands", async () => {
      const client = makeClient({
        command: "bash",
        output_args: ["-c", "exit 42"],
      });
      const agent = new BaseCLIAgent(client);
      const result = await agent.run(undefined, "");
      expect(result.exitCode).toBe(42);
    });

    it("reports ENOENT for missing commands", async () => {
      const client = makeClient({ command: "nonexistent_command_xyz" });
      const agent = new BaseCLIAgent(client);
      const result = await agent.run(undefined, "");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });

    it("pipes stdin content to the process", async () => {
      const client = makeClient({
        command: "cat",
        output_args: [],
        prompt_injection: "stdin",
      });
      const agent = new BaseCLIAgent(client);
      const result = await agent.run("system", "user input");
      expect(result.stdout.trim()).toBe("system\n\nuser input");
    });

    it("validates cwd and rejects non-existent directories", async () => {
      const client = makeClient({ command: "echo" });
      const agent = new BaseCLIAgent(client);
      const result = await agent.run(undefined, "test", "/nonexistent/path/xyz");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("cwd does not exist");
    });

    it("validates cwd and rejects files (not directories)", async () => {
      const client = makeClient({ command: "echo" });
      const agent = new BaseCLIAgent(client);
      const result = await agent.run(undefined, "test", "/etc/hosts");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not a directory");
    });

    it("times out slow processes", async () => {
      const client = makeClient({
        command: "sleep",
        output_args: ["30"],
        timeout_seconds: 1,
      });
      const agent = new BaseCLIAgent(client);
      const result = await agent.run(undefined, "");
      expect(result.timedOut).toBe(true);
    }, 10_000);

    it("handles concurrent spawns within limit", async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => {
          const client = makeClient({ command: "echo", output_args: ["ok"] });
          const agent = new BaseCLIAgent(client);
          return agent.run(undefined, "");
        })
      );
      expect(results.every(r => r.exitCode === 0)).toBe(true);
      expect(results.every(r => r.stdout.trim() === "ok")).toBe(true);
    });
  });
});

describe("Agent Factory", () => {
  it("creates BaseCLIAgent for unknown runner", () => {
    const client = makeClient({ runner: "base" });
    const agent = createAgent(client);
    expect(agent).toBeInstanceOf(BaseCLIAgent);
  });

  it("creates GeminiAgent for gemini runner", async () => {
    const { GeminiAgent } = await import("../src/agents/gemini.js");
    const client = makeClient({ runner: "gemini" });
    const agent = createAgent(client);
    expect(agent).toBeInstanceOf(GeminiAgent);
  });

  it("creates ClaudeAgent for claude runner", async () => {
    const { ClaudeAgent } = await import("../src/agents/claude.js");
    const client = makeClient({ runner: "claude" });
    const agent = createAgent(client);
    expect(agent).toBeInstanceOf(ClaudeAgent);
  });

  it("creates CodexAgent for codex runner", async () => {
    const { CodexAgent } = await import("../src/agents/codex.js");
    const client = makeClient({ runner: "codex" });
    const agent = createAgent(client);
    expect(agent).toBeInstanceOf(CodexAgent);
  });
});
