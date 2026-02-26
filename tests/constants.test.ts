import { describe, it, expect } from "vitest";
import {
  PROJECT_ROOT,
  CONF_DIR,
  PROMPTS_DIR,
  DEFAULT_TIMEOUT_SECONDS,
  MAX_OUTPUT_CHARS,
  MAX_THREADS,
  THREAD_TTL_MS,
  MAX_CONCURRENT_AGENTS,
} from "../src/config/constants.js";
import fs from "node:fs";

describe("Constants", () => {
  it("PROJECT_ROOT exists and has package.json", () => {
    expect(fs.existsSync(PROJECT_ROOT)).toBe(true);
    expect(fs.existsSync(`${PROJECT_ROOT}/package.json`)).toBe(true);
  });

  it("CONF_DIR points to conf/cli_clients", () => {
    expect(CONF_DIR).toContain("conf");
    expect(CONF_DIR).toContain("cli_clients");
    expect(fs.existsSync(CONF_DIR)).toBe(true);
  });

  it("PROMPTS_DIR points to prompts", () => {
    expect(PROMPTS_DIR).toContain("prompts");
    expect(fs.existsSync(PROMPTS_DIR)).toBe(true);
  });

  it("DEFAULT_TIMEOUT_SECONDS is 300 (5 min)", () => {
    expect(DEFAULT_TIMEOUT_SECONDS).toBe(300);
  });

  it("MAX_OUTPUT_CHARS is 20,000", () => {
    expect(MAX_OUTPUT_CHARS).toBe(20_000);
  });

  it("MAX_THREADS is 100", () => {
    expect(MAX_THREADS).toBe(100);
  });

  it("THREAD_TTL_MS is 30 minutes", () => {
    expect(THREAD_TTL_MS).toBe(30 * 60 * 1000);
  });

  it("MAX_CONCURRENT_AGENTS is 5", () => {
    expect(MAX_CONCURRENT_AGENTS).toBe(5);
  });
});
