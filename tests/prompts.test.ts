import { describe, it, expect } from "vitest";
import { loadSystemPrompt, loadPrompt } from "../src/prompts/loader.js";

describe("Prompt Loader", () => {
  const ALL_ROLES = [
    "default", "reviewer", "debugger", "planner", "thinker",
    "analyst", "refactor", "testgen", "secaudit", "docgen",
    "precommit", "challenger", "apilookup", "tracer",
  ];

  describe("loadSystemPrompt", () => {
    it("loads all 14 built-in roles without error", () => {
      for (const role of ALL_ROLES) {
        const prompt = loadSystemPrompt(role);
        expect(prompt, `Role "${role}" should return a prompt`).toBeTruthy();
        expect(typeof prompt).toBe("string");
        expect(prompt!.length).toBeGreaterThan(10);
      }
    });

    it("includes capabilities preamble in all prompts", () => {
      for (const role of ALL_ROLES) {
        const prompt = loadSystemPrompt(role)!;
        expect(prompt).toContain("You have full tool access");
        expect(prompt).toContain("Read, write, and edit files");
      }
    });

    it("strips {{PROMPT}} placeholder from templates", () => {
      for (const role of ALL_ROLES) {
        const prompt = loadSystemPrompt(role)!;
        expect(prompt).not.toContain("{{PROMPT}}");
      }
    });

    it("returns null for invalid role names", () => {
      expect(loadSystemPrompt("../../../etc/passwd")).toBeNull();
      expect(loadSystemPrompt("role with spaces")).toBeNull();
      expect(loadSystemPrompt("rm;-rf")).toBeNull();
    });

    it("falls back to default for unknown valid role names", () => {
      const unknown = loadSystemPrompt("nonexistent-role");
      const defaultPrompt = loadSystemPrompt("default");
      expect(unknown).toBe(defaultPrompt);
    });
  });

  describe("loadPrompt", () => {
    it("interpolates user prompt into template", () => {
      const result = loadPrompt("reviewer", "Review this code");
      expect(result).toContain("Review this code");
    });

    it("returns raw prompt for invalid role", () => {
      const result = loadPrompt("../invalid", "my prompt");
      expect(result).toBe("my prompt");
    });
  });
});
