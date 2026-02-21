import fs from "node:fs";
import path from "node:path";
import type { CLIClientConfig, ResolvedClient } from "../types.js";
import { INTERNAL_DEFAULTS } from "./internal-defaults.js";
import { CONF_DIR, USER_CONF_DIR, DEFAULT_TIMEOUT_SECONDS } from "./constants.js";

const clientCache = new Map<string, ResolvedClient>();

function loadJsonConfigs(dir: string): CLIClientConfig[] {
  if (!fs.existsSync(dir)) return [];
  const configs: CLIClientConfig[] = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    try {
      const raw = fs.readFileSync(path.join(dir, f), "utf-8");
      configs.push(JSON.parse(raw) as CLIClientConfig);
    } catch (err) {
      console.error(`[hive] Failed to load config ${path.join(dir, f)}: ${err}`);
    }
  }
  return configs;
}

function resolve(config: CLIClientConfig): ResolvedClient {
  const runnerKey = config.runner ?? config.name;
  const defaults = INTERNAL_DEFAULTS[runnerKey];

  return {
    name: config.name,
    command: config.command,
    runner: defaults?.runner ?? "base",
    parser: defaults?.parser ?? "raw",
    output_args: defaults?.output_args ?? [],
    additional_args: config.additional_args ?? [],
    prompt_injection: defaults?.prompt_injection ?? "stdin",
    prompt_flag: defaults?.prompt_flag,
    env: config.env ?? {},
    timeout_seconds: config.timeout_seconds ?? DEFAULT_TIMEOUT_SECONDS,
    roles: config.roles ?? {},
  };
}

export function loadAllClients(): void {
  clientCache.clear();

  // Load built-in configs first
  for (const config of loadJsonConfigs(CONF_DIR)) {
    clientCache.set(config.name, resolve(config));
  }

  // User overrides take precedence
  for (const config of loadJsonConfigs(USER_CONF_DIR)) {
    clientCache.set(config.name, resolve(config));
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
