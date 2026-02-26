import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

const BIN = path.join(import.meta.dirname, "..", "dist", "index.js");
const TEST_CONF_DIR = path.join(os.homedir(), ".hive", "cli_clients");

function run(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [BIN, ...args], {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env },
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? "",
      exitCode: err.status ?? 1,
    };
  }
}

// Clean up any test configs after each test
function cleanup(name: string): void {
  const p = path.join(TEST_CONF_DIR, `${name}.json`);
  try { fs.unlinkSync(p); } catch { /* ignore */ }
}

describe("CLI Commands", () => {
  // ─── help ────────────────────────────────────────────────

  describe("help", () => {
    it("shows help text", () => {
      const result = run("help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Hive MCP");
      expect(result.stdout).toContain("hive-mcp list");
      expect(result.stdout).toContain("hive-mcp add");
      expect(result.stdout).toContain("hive-mcp remove");
    });

    it("--help flag works", () => {
      const result = run("--help");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Hive MCP");
    });

    it("-h flag works", () => {
      const result = run("-h");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Hive MCP");
    });
  });

  // ─── list ────────────────────────────────────────────────

  describe("list", () => {
    it("shows available clients", () => {
      const result = run("list");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Hive MCP");
      expect(result.stdout).toContain("Status");
      expect(result.stdout).toContain("clients available");
    });

    it("shows built-in source", () => {
      const result = run("list");
      expect(result.stdout).toContain("built-in");
    });
  });

  // ─── add ─────────────────────────────────────────────────

  describe("add", () => {
    const testName = "test-add-client";
    afterEach(() => cleanup(testName));

    it("fails with no arguments", () => {
      const result = run("add");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    it("fails with invalid name", () => {
      const result = run("add", "../bad-name", "--command", "echo");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Invalid name");
    });

    it("fails without --command and without --from", () => {
      const result = run("add", testName);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("--command is required");
    });

    it("creates config from scratch", () => {
      const result = run("add", testName, "--command", "echo", "--timeout", "120");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Created");

      const configPath = path.join(TEST_CONF_DIR, `${testName}.json`);
      expect(fs.existsSync(configPath)).toBe(true);

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.name).toBe(testName);
      expect(config.command).toBe("echo");
      expect(config.runner).toBe("base");
      expect(config.timeout_seconds).toBe(120);
    });

    it("clones from existing client", () => {
      const result = run("add", testName, "--from", "gemini", "--args", "-m gemini-2.0-flash");
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Cloned from");

      const configPath = path.join(TEST_CONF_DIR, `${testName}.json`);
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(config.command).toBe("gemini");
      expect(config.runner).toBe("gemini");
      expect(config.additional_args).toContain("-m");
      expect(config.additional_args).toContain("gemini-2.0-flash");
    });

    it("prevents duplicate names", () => {
      run("add", testName, "--command", "echo");
      const result = run("add", testName, "--command", "echo");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("already exists");
    });

    it("fails when --from references unknown client", () => {
      const result = run("add", testName, "--from", "nonexistent");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("not found");
    });
  });

  // ─── remove ──────────────────────────────────────────────

  describe("remove", () => {
    const testName = "test-remove-client";

    it("fails with no arguments", () => {
      const result = run("remove");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage");
    });

    it("removes user config", () => {
      run("add", testName, "--command", "echo");
      const configPath = path.join(TEST_CONF_DIR, `${testName}.json`);
      expect(fs.existsSync(configPath)).toBe(true);

      const result = run("remove", testName);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Removed");
      expect(fs.existsSync(configPath)).toBe(false);
    });

    it("refuses to remove built-in configs", () => {
      const result = run("remove", "claude");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("built-in");
    });

    it("fails for nonexistent config", () => {
      const result = run("remove", "nonexistent-xyz");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("No user config");
    });
  });
});
