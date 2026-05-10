import fs from "node:fs";
import path from "node:path";
import type { CLIClientConfig, ResolvedClient } from "../types.js";
import { INTERNAL_DEFAULTS } from "./internal-defaults.js";
import { CONF_DIR, USER_CONF_DIR, DEFAULT_TIMEOUT_SECONDS, MAX_TIMEOUT_SECONDS } from "./constants.js";
import { isBinaryAvailable } from "../cli/detect.js";
import { log } from "../log.js";
import { listOpenCodeModels } from "../opencode/models.js";

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/;
const OPENCODE_MODEL_PREFIX = "opencode:";
const SAFE_OPENCODE_MODEL = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:/-]+$/;
const SENSITIVE_ENV_PATTERNS = [
  /^AWS_SECRET/,
  /^AWS_SESSION_TOKEN$/,
  /^GH_TOKEN$/,
  /^GITHUB_TOKEN$/,
  /^GITLAB_TOKEN$/,
  /^BITBUCKET_TOKEN$/,
  /^SLACK_TOKEN$/,
  /^DOCKER_TOKEN$/,
  /_SECRET$/,
  /_SECRET_KEY$/,
  /_TOKEN$/,
  /_PASSWORD$/,
  /_API_KEY$/,
  /_CREDENTIAL/,
  /PRIVATE_KEY/,
  /^API_KEY$/,
  /^DATABASE_URL$/,
  /^NPM_TOKEN$/,
];

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
    MAX_TIMEOUT_SECONDS,
  );

  // Block dangerous and secret env overrides from configs. Child processes still
  // inherit safe environment values after BaseCLIAgent filtering; configs should
  // not be a place where publishable credentials can accidentally live.
  const safeEnv: Record<string, string> = {};
  const BLOCKED_ENV = ["LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES"];
  for (const [key, value] of Object.entries(config.env ?? {})) {
    if (BLOCKED_ENV.includes(key) || SENSITIVE_ENV_PATTERNS.some(p => p.test(key))) {
      log(`Config "${config.name}": blocked env var "${key}"`, "WARN");
      continue;
    }
    safeEnv[key] = value;
  }

  return {
    name: config.name,
    command: config.command,
    config_runner: runnerKey,
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

function resolveOpenCodeModelClient(name: string): ResolvedClient | null {
  const hasPrefix = name.startsWith(OPENCODE_MODEL_PREFIX);
  if (!hasPrefix && !SAFE_OPENCODE_MODEL.test(name.trim())) return null;

  const model = (hasPrefix ? name.slice(OPENCODE_MODEL_PREFIX.length) : name).trim();
  if (!SAFE_OPENCODE_MODEL.test(model)) {
    log(`Rejected invalid OpenCode model client name: ${name}`, "WARN");
    return null;
  }

  if (!isBinaryAvailable("opencode")) {
    log(`OpenCode model client requested but opencode is not in PATH: ${name}`, "WARN");
    return null;
  }

  const defaults = INTERNAL_DEFAULTS.opencode;
  return {
    name,
    command: "opencode",
    config_runner: "opencode",
    runner: defaults.runner,
    parser: defaults.parser,
    output_args: defaults.output_args,
    additional_args: ["--model", model, "--dangerously-skip-permissions"],
    prompt_injection: defaults.prompt_injection,
    prompt_flag: defaults.prompt_flag,
    env: { OPENCODE_DISABLE_CLAUDE_CODE: "true" },
    timeout_seconds: DEFAULT_TIMEOUT_SECONDS,
    roles: {},
  };
}

function registerOpenCodeModelClients(detected: string[]): void {
  const result = listOpenCodeModels();
  if (!result.available) {
    if (result.error) log(`OpenCode model discovery unavailable: ${result.error}`, "WARN");
    return;
  }

  let added = 0;
  for (const clientName of result.clients) {
    if (clientCache.has(clientName)) continue;
    const resolved = resolveOpenCodeModelClient(clientName);
    if (!resolved) continue;
    clientCache.set(clientName, resolved);
    detected.push(clientName);
    added++;
  }

  log(`Discovered ${added} OpenCode model clients`, "INFO");
}

export function loadAllClients(detectBinaries = true, loadUserConfigs = true, discoverOpenCodeModels = detectBinaries): void {
  clientCache.clear();

  const detected: string[] = [];
  const skipped: string[] = [];

  // Load built-in configs — skip if binary not in PATH (when detection enabled)
  for (const config of loadJsonConfigs(CONF_DIR)) {
    const resolved = resolve(config);
    if (!resolved) continue;

    if (detectBinaries && !isBinaryAvailable(resolved.command)) {
      skipped.push(resolved.name);
      continue;
    }

    clientCache.set(resolved.name, resolved);
    detected.push(resolved.name);
  }

  // User configs always load (user explicitly created them), but warn if binary missing
  if (loadUserConfigs) {
    for (const config of loadJsonConfigs(USER_CONF_DIR)) {
      const resolved = resolve(config);
      if (!resolved) continue;

      if (detectBinaries && !isBinaryAvailable(resolved.command)) {
        log(`Warning: User config "${resolved.name}" — command "${resolved.command}" not found in PATH`);
      }

      clientCache.set(resolved.name, resolved);
      if (!detected.includes(resolved.name)) detected.push(resolved.name);
    }
  }

  if (discoverOpenCodeModels) {
    registerOpenCodeModelClients(detected);
  }

  if (detectBinaries) {
    const staticClients = detected.filter(name => !name.startsWith(OPENCODE_MODEL_PREFIX));
    const opencodeModelCount = detected.length - staticClients.length;
    const modelSuffix = opencodeModelCount > 0 ? ` + ${opencodeModelCount} OpenCode model clients` : "";
    log(`Detected: ${staticClients.join(", ") || "none"}${modelSuffix} (${detected.length} clients)`);
    if (skipped.length > 0) {
      log(`Skipped (not in PATH): ${skipped.join(", ")}`);
    }
  }
}

export function getClient(name: string): ResolvedClient | undefined {
  if (clientCache.size === 0) loadAllClients();
  const dynamicOpenCodeClient = resolveOpenCodeModelClient(name);
  if (dynamicOpenCodeClient) return dynamicOpenCodeClient;
  return clientCache.get(name);
}

export function listClients(): string[] {
  if (clientCache.size === 0) loadAllClients();
  return Array.from(clientCache.keys());
}

export function supportsOpenCodeModelClients(): boolean {
  return isBinaryAvailable("opencode");
}

export function opencodeModelClientHint(): string {
  return `${OPENCODE_MODEL_PREFIX}<provider/model>`;
}
