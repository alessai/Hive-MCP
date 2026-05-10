import { execFileSync } from "node:child_process";
import { findBinary } from "../cli/detect.js";
import { log } from "../log.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export interface OpenCodeModelList {
  available: boolean;
  models: string[];
  clients: string[];
  error?: string;
}

export function listOpenCodeModels(args: string[] = [], timeoutMs = DEFAULT_TIMEOUT_MS): OpenCodeModelList {
  if (!findBinary("opencode")) {
    return {
      available: false,
      models: [],
      clients: [],
      error: "opencode is not installed or not in PATH",
    };
  }

  try {
    const stdout = execFileSync("opencode", ["models", ...args], {
      encoding: "utf-8",
      timeout: timeoutMs,
      env: process.env,
    });
    const models = stdout.split("\n").map(s => s.trim()).filter(Boolean);
    return {
      available: true,
      models,
      clients: models.map(model => `opencode:${model}`),
    };
  } catch (err: any) {
    const error = String(err.stderr || err.message || err);
    log("Failed to list OpenCode models", "WARN", { error });
    return {
      available: false,
      models: [],
      clients: [],
      error,
    };
  }
}
