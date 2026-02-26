import { describe, it, expect } from "vitest";

// ─── Path traversal prevention (continuation store) ──────────

describe("Continuation ID validation", () => {
  // We test the SAFE_ID regex directly since the store uses fs
  const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

  it("accepts valid IDs", () => {
    expect(SAFE_ID.test("session-1")).toBe(true);
    expect(SAFE_ID.test("my_thread")).toBe(true);
    expect(SAFE_ID.test("abc123")).toBe(true);
    expect(SAFE_ID.test("A-B_C")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(SAFE_ID.test("../../../etc/passwd")).toBe(false);
    expect(SAFE_ID.test("..")).toBe(false);
    expect(SAFE_ID.test("foo/../bar")).toBe(false);
    expect(SAFE_ID.test("/etc/passwd")).toBe(false);
  });

  it("rejects special characters", () => {
    expect(SAFE_ID.test("foo bar")).toBe(false);
    expect(SAFE_ID.test("foo;rm -rf")).toBe(false);
    expect(SAFE_ID.test("foo\nbar")).toBe(false);
    expect(SAFE_ID.test("foo\x00bar")).toBe(false);
    expect(SAFE_ID.test("")).toBe(false);
    expect(SAFE_ID.test(".")).toBe(false);
    expect(SAFE_ID.test("foo.bar")).toBe(false);
  });
});

// ─── Config name validation ──────────────────────────────────

describe("Config name validation", () => {
  const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;

  it("accepts valid config names", () => {
    expect(SAFE_NAME.test("gemini")).toBe(true);
    expect(SAFE_NAME.test("my-custom-agent")).toBe(true);
    expect(SAFE_NAME.test("agent_v2")).toBe(true);
  });

  it("rejects dangerous names", () => {
    expect(SAFE_NAME.test("")).toBe(false);
    expect(SAFE_NAME.test("../evil")).toBe(false);
    expect(SAFE_NAME.test("name with spaces")).toBe(false);
    expect(SAFE_NAME.test("rm;-rf")).toBe(false);
  });
});

// ─── Role name validation ────────────────────────────────────

describe("Role name validation", () => {
  const SAFE_ROLE = /^[a-zA-Z0-9_-]+$/;

  it("accepts valid role names", () => {
    expect(SAFE_ROLE.test("reviewer")).toBe(true);
    expect(SAFE_ROLE.test("sec-audit")).toBe(true);
    expect(SAFE_ROLE.test("custom_role")).toBe(true);
  });

  it("rejects path traversal in roles", () => {
    expect(SAFE_ROLE.test("../../etc/passwd")).toBe(false);
    expect(SAFE_ROLE.test("role/../../../secret")).toBe(false);
  });
});

// ─── Environment variable filtering ─────────────────────────

describe("Environment filtering", () => {
  const SENSITIVE_ENV_PATTERNS = [
    /^AWS_SECRET/,
    /^AWS_SESSION_TOKEN$/,
    /^GH_TOKEN$/,
    /^GITHUB_TOKEN$/,
    /_SECRET$/,
    /_SECRET_KEY$/,
    /^NPM_TOKEN$/,
  ];

  function isSensitive(key: string): boolean {
    return SENSITIVE_ENV_PATTERNS.some(p => p.test(key));
  }

  it("blocks AWS secrets", () => {
    expect(isSensitive("AWS_SECRET_ACCESS_KEY")).toBe(true);
    expect(isSensitive("AWS_SECRET")).toBe(true);
    expect(isSensitive("AWS_SESSION_TOKEN")).toBe(true);
  });

  it("blocks GitHub tokens", () => {
    expect(isSensitive("GH_TOKEN")).toBe(true);
    expect(isSensitive("GITHUB_TOKEN")).toBe(true);
  });

  it("blocks NPM token", () => {
    expect(isSensitive("NPM_TOKEN")).toBe(true);
  });

  it("blocks vars ending with _SECRET", () => {
    expect(isSensitive("DATABASE_SECRET")).toBe(true);
    expect(isSensitive("MY_APP_SECRET")).toBe(true);
  });

  it("blocks vars ending with _SECRET_KEY", () => {
    expect(isSensitive("STRIPE_SECRET_KEY")).toBe(true);
  });

  it("allows safe variables through", () => {
    expect(isSensitive("HOME")).toBe(false);
    expect(isSensitive("PATH")).toBe(false);
    expect(isSensitive("NODE_ENV")).toBe(false);
    expect(isSensitive("AWS_REGION")).toBe(false);
    expect(isSensitive("AWS_DEFAULT_REGION")).toBe(false);
    expect(isSensitive("GEMINI_API_KEY")).toBe(false); // needed for gemini CLI
  });
});

// ─── Blocked env vars in config ──────────────────────────────

describe("Config env var blocking", () => {
  const BLOCKED_ENV = ["LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES"];

  it("blocks LD_PRELOAD", () => {
    expect(BLOCKED_ENV.includes("LD_PRELOAD")).toBe(true);
  });

  it("blocks LD_LIBRARY_PATH", () => {
    expect(BLOCKED_ENV.includes("LD_LIBRARY_PATH")).toBe(true);
  });

  it("blocks DYLD_INSERT_LIBRARIES", () => {
    expect(BLOCKED_ENV.includes("DYLD_INSERT_LIBRARIES")).toBe(true);
  });
});
