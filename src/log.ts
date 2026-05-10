import fs from "node:fs";
import { LOG_DIR, LOG_FILE } from "./config/constants.js";

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

const MAX_LOG_BYTES = 5 * 1024 * 1024;
const TOKENISH = /(token|secret|password|private[_-]?key|credential|authorization)/i;

function shouldLog(level: LogLevel): boolean {
  const configured = (process.env.HIVE_LOG_LEVEL ?? "INFO").toUpperCase() as LogLevel;
  const rank: Record<LogLevel, number> = { DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 };
  return rank[level] >= (rank[configured] ?? rank.INFO);
}

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    // Redact common inline secret shapes without destroying useful diagnostics.
    return value
      .replace(/([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|AUTHORIZATION)[A-Z0-9_]*=)[^\s]+/gi, "$1[REDACTED]")
      .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[REDACTED]");
  }
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(redact);

  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    out[key] = TOKENISH.test(key) ? "[REDACTED]" : redact(nested);
  }
  return out;
}

function rotateIfNeeded(): void {
  try {
    const stat = fs.existsSync(LOG_FILE) ? fs.statSync(LOG_FILE) : undefined;
    if (!stat || stat.size < MAX_LOG_BYTES) return;
    const rotated = `${LOG_FILE}.1`;
    try { fs.rmSync(rotated, { force: true }); } catch { /* ignore */ }
    fs.renameSync(LOG_FILE, rotated);
  } catch {
    // Logging must never break MCP responses.
  }
}

/**
 * Log to stderr and ~/.hive/logs/hive-mcp.log.
 * Stderr is safe for MCP stdio servers because JSON-RPC uses stdout.
 */
export function log(msg: string, level: LogLevel = "INFO", meta?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const timestamp = new Date().toISOString();
  const safeMeta = meta ? ` ${JSON.stringify(redact(meta))}` : "";
  const line = `[hive ${timestamp}] [${level}] ${redact(msg)}${safeMeta}\n`;

  try { process.stderr.write(line); } catch { /* ignore */ }

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    // Logging must never break MCP responses.
  }
}

export function getLogFilePath(): string {
  return LOG_FILE;
}
