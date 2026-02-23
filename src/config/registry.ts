import fs from "node:fs";
import path from "node:path";
import type { CLIClientConfig, ResolvedClient } from "../types.js";
import { INTERNAL_DEFAULTS } from "./internal-defaults.js";
import { CONF_DIR, USER_CONF_DIR, DEFAULT_TIMEOUT_SECONDS } from "./constants.js";
import { log } from "../log.js";

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;
const MAX_TIMEOUT = 7200; // 2 hours

const clientCache = new Map<string, ResolvedClient>();

function loadJsonConfigs(dir: string): CLIClientConfig[] {
  if (!fs.existsSync(dir)) return [];
  const configs: CLIClientConfig[] = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), "utf-8");
      configs.push(JSON.parse(raw) as CLIClientConfig);
    } catch (err) {
      log(`Failed to load config ${f}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return configs;
}

function resolve(config: CLIClientConfig): ResolvedClient | null {
  if (!config.name || !SAFE_NAME.test(config.name)) {
    log(`Skipping config with invalid name: ${String(config.name)}`);
    return null;
  }
  if (!config.command || typeof config.command !== "string") {
    log(`Skipping config "${config.name}": missing or invalid command`);
    return null;
  }

  const runnerKey = config.runner ?? config.name;
  const defaults = INTERNAL_DEFAULTS[runnerKey];
  const timeout = Math.min(
    Math.max(1, config.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS),
    MAX_TIMEOUT,
  );

  // Block dangerous env overrides from configs
  const safeEnv: Record<string, string> = {};
  const BLOCKED_ENV = ["LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES"];
  for (const [key, value] of Object.entries(config.env ?? {})) {
    if (BLOCKED_ENV.includes(key)) {
      log(`Config "${config.name}": blocked dangerous env var "${key}"`);
      continue;
    }
    safeEnv[key] = value;
  }

  return {
    name: config.name,
    command: config.command,
    runner: defaults?.runner ?? "base",
    parser: defaults?.parser ?? "raw",
    output_args: defaults?.output_args ?? [],
    additional_args: config.additional_args ?? [],
    prompt_injection: defaults?.prompt_injection ?? "stdin",
    prompt_flag: defaults?.prompt_flag,
    env: safeEnv,
    timeout_seconds: timeout,
    roles: config.roles ?? {},
  };
}

export function loadAllClients(): void {
  clientCache.clear();

  // Load built-in configs first
  for (const config of loadJsonConfigs(CONF_DIR)) {
    const resolved = resolve(config);
    if (resolved) clientCache.set(resolved.name, resolved);
  }

  // User overrides take precedence
  for (const config of loadJsonConfigs(USER_CONF_DIR)) {
    const resolved = resolve(config);
    if (resolved) clientCache.set(resolved.name, resolved);
  }
}

export function getClient(name: string): ResolvedClient | undefined {
  if (clientCache.size === 0) loadAllClients();
  return clientCache.get(name);
}

export function listClients(): string[] {
  if (clientCache.size === 0) loadAllClients();
  return Array.from(clientCache.keys());
}
