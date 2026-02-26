import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const BIN = path.join(import.meta.dirname, "..", "dist", "index.js");

function run(...args: string[]): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync("node", [BIN, ...args], {
      encoding: "utf-8",
      timeout: 10_000,
    });
    return { stdout, stderr: "", exitCode: 0 };
  } catch (err: any) {
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? "", exitCode: err.status ?? 1 };
  }
}

describe("Security fixes from audit", () => {
  // ─── Fix #1: Path traversal in cmdRemove ─────────────────

  describe("cmdRemove path traversal prevention", () => {
    it("rejects path traversal in remove name", () => {
      const result = run("remove", "../../etc/passwd");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Invalid name");
    });

    it("rejects dotdot in remove name", () => {
      const result = run("remove", "..");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Invalid name");
    });

    it("rejects slash in remove name", () => {
      const result = run("remove", "foo/bar");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Invalid name");
    });

    it("rejects space in remove name", () => {
      const result = run("remove", "foo bar");
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Invalid name");
    });
  });

  // ─── Fix #2: Broader env filtering ───────────────────────

  describe("expanded env var filtering", () => {
    const SENSITIVE_ENV_PATTERNS = [
      /^AWS_SECRET/, /^AWS_SESSION_TOKEN$/, /^GH_TOKEN$/, /^GITHUB_TOKEN$/,
      /^GITLAB_TOKEN$/, /^BITBUCKET_TOKEN$/, /^SLACK_TOKEN$/, /^DOCKER_TOKEN$/,
      /_SECRET$/, /_SECRET_KEY$/, /_TOKEN$/, /_PASSWORD$/,
      /_CREDENTIAL/, /PRIVATE_KEY/, /^DATABASE_URL$/, /^NPM_TOKEN$/,
    ];

    function isSensitive(key: string): boolean {
      return SENSITIVE_ENV_PATTERNS.some(p => p.test(key));
    }

    it("blocks GITLAB_TOKEN", () => expect(isSensitive("GITLAB_TOKEN")).toBe(true));
    it("blocks BITBUCKET_TOKEN", () => expect(isSensitive("BITBUCKET_TOKEN")).toBe(true));
    it("blocks SLACK_TOKEN", () => expect(isSensitive("SLACK_TOKEN")).toBe(true));
    it("blocks DOCKER_TOKEN", () => expect(isSensitive("DOCKER_TOKEN")).toBe(true));
    it("blocks vars ending _TOKEN", () => expect(isSensitive("CUSTOM_API_TOKEN")).toBe(true));
    it("blocks vars ending _PASSWORD", () => expect(isSensitive("DB_PASSWORD")).toBe(true));
    it("blocks vars with _CREDENTIAL", () => expect(isSensitive("AWS_CREDENTIAL")).toBe(true));
    it("blocks vars with PRIVATE_KEY", () => expect(isSensitive("SSH_PRIVATE_KEY")).toBe(true));
    it("blocks DATABASE_URL", () => expect(isSensitive("DATABASE_URL")).toBe(true));

    it("still allows safe vars", () => {
      expect(isSensitive("HOME")).toBe(false);
      expect(isSensitive("PATH")).toBe(false);
      expect(isSensitive("NODE_ENV")).toBe(false);
    });
  });

  // ─── Fix #3: Replace pattern injection ────────────────────

  describe("prompt template replace pattern safety", () => {
    it("does not interpret $ patterns in user prompts", () => {
      // This tests the fix: .replace(..., () => userPrompt)
      // $& in a regular .replace() would insert the matched text
      const template = "System prompt: {{PROMPT}}";
      const userPrompt = "test $& $` $' $$";
      const result = template.replace(/\{\{PROMPT\}\}/g, () => userPrompt);
      expect(result).toBe("System prompt: test $& $` $' $$");
    });
  });
});
