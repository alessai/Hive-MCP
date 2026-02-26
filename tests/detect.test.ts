import { describe, it, expect } from "vitest";
import { findBinary, isBinaryAvailable } from "../src/cli/detect.js";

describe("Binary Detection", () => {
  describe("findBinary", () => {
    it("finds common system binaries", () => {
      const result = findBinary("echo");
      expect(result).not.toBeNull();
      expect(result).toContain("echo");
    });

    it("finds bash", () => {
      expect(findBinary("bash")).not.toBeNull();
    });

    it("finds cat", () => {
      expect(findBinary("cat")).not.toBeNull();
    });

    it("returns null for nonexistent binary", () => {
      expect(findBinary("definitely_not_a_real_binary_xyz_123")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(findBinary("")).toBeNull();
    });

    it("handles absolute paths", () => {
      expect(findBinary("/usr/bin/env")).not.toBeNull();
    });

    it("returns null for nonexistent absolute path", () => {
      expect(findBinary("/nonexistent/path/to/binary")).toBeNull();
    });

    it("returns full path string", () => {
      const result = findBinary("echo");
      expect(result).toMatch(/^\/.*echo$/);
    });
  });

  describe("isBinaryAvailable", () => {
    it("returns true for available binaries", () => {
      expect(isBinaryAvailable("echo")).toBe(true);
      expect(isBinaryAvailable("bash")).toBe(true);
    });

    it("returns false for unavailable binaries", () => {
      expect(isBinaryAvailable("not_a_real_binary_abc")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isBinaryAvailable("")).toBe(false);
    });
  });
});
