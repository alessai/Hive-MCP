import fs from "node:fs";
import path from "node:path";
import { USER_CONF_DIR, CONF_DIR } from "../config/constants.js";
import { loadAllClients, getClient, listClients } from "../config/registry.js";
import { findBinary } from "./detect.js";

// Known install hints for built-in CLIs
const INSTALL_HINTS: Record<string, string> = {
  gemini: "npm i -g @anthropic-ai/gemini-cli   — https://github.com/google-gemini/gemini-cli",
  claude: "npm i -g @anthropic-ai/claude-code  — https://docs.anthropic.com/claude-code",
  codex: "npm i -g @openai/codex              — https://github.com/openai/codex",
  opencode: "go install github.com/nicholasgriffintn/opencode@latest",
  qwen: "npm i -g qwen-code                  — https://github.com/QwenLM/qwen-code",
  kilocode: "npm i -g kilocode                   — https://github.com/kilocode/kilocode",
};

function ensureUserDir(): void {
  fs.mkdirSync(USER_CONF_DIR, { recursive: true });
}

/** hive-mcp list — show all clients with availability status */
export function cmdList(): void {
  loadAllClients();
  const names = listClients();

  if (names.length === 0) {
    console.log("No CLI clients configured.");
    return;
  }

  console.log("\nHive MCP — CLI Clients\n");
  console.log("  Status  Name            Command         Source");
  console.log("  ─────── ─────────────── ─────────────── ──────────────────────────");

  for (const name of names.sort()) {
    const client = getClient(name)!;
    const binaryPath = findBinary(client.command);
    const status = binaryPath ? "  ✓" : "  ✗";
    const location = binaryPath ?? "not in PATH";
    const isUser = fs.existsSync(path.join(USER_CONF_DIR, `${name}.json`));
    const source = isUser ? "~/.hive/cli_clients/" : "built-in";

    const nameCol = name.padEnd(16);
    const cmdCol = client.command.padEnd(16);
    console.log(`${status}     ${nameCol}${cmdCol}${source}`);
    if (!binaryPath) {
      const hint = INSTALL_HINTS[client.command];
      if (hint) {
        console.log(`          └─ Install: ${hint}`);
      }
    }
  }

  const available = names.filter(n => findBinary(getClient(n)!.command));
  console.log(`\n  ${available.length}/${names.length} clients available\n`);
}

/** hive-mcp add <name> — create a custom CLI config */
export function cmdAdd(args: string[]): void {
  // Parse flags
  const name = args[0];
  if (!name) {
    console.error("Usage: hive-mcp add <name> [--from <existing>] [--command <cmd>] [--args \"...\"] [--timeout <seconds>]");
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    console.error(`Error: Invalid name "${name}". Use only letters, numbers, hyphens, underscores.`);
    process.exit(1);
  }

  const flags = parseFlags(args.slice(1));
  const fromName = flags["from"];
  const command = flags["command"];
  const extraArgs = flags["args"];
  const timeout = flags["timeout"];
  const runner = flags["runner"];

  loadAllClients();

  let config: any;

  if (fromName) {
    // Clone mode — copy existing config
    const source = getClient(fromName);
    if (!source) {
      console.error(`Error: Source client "${fromName}" not found. Available: ${listClients().join(", ")}`);
      process.exit(1);
    }

    config = {
      name,
      command: command ?? source.command,
      runner: runner ?? source.runner,
      additional_args: [...source.additional_args],
      env: { ...source.env },
      timeout_seconds: timeout ? parseInt(timeout, 10) : source.timeout_seconds,
    };

    // Append extra args
    if (extraArgs) {
      config.additional_args.push(...splitArgs(extraArgs));
    }
  } else {
    // New mode — create from scratch
    if (!command) {
      console.error("Error: --command is required when not using --from.");
      console.error("Usage: hive-mcp add <name> --command <cmd> [--runner <runner>] [--args \"...\"] [--timeout <seconds>]");
      process.exit(1);
    }

    config = {
      name,
      command,
      runner: runner ?? "base",
      additional_args: extraArgs ? splitArgs(extraArgs) : [],
      env: {},
      timeout_seconds: timeout ? parseInt(timeout, 10) : 300,
    };
  }

  // Write config atomically (wx = fail if exists, prevents TOCTOU race)
  ensureUserDir();
  const configPath = path.join(USER_CONF_DIR, `${name}.json`);

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "EEXIST") {
      console.error(`Error: Config "${name}" already exists at ${configPath}`);
      console.error(`Delete it first with: hive-mcp remove ${name}`);
      process.exit(1);
    }
    throw err;
  }

  const binaryPath = findBinary(config.command);
  console.log(`\n  ✓ Created: ${configPath}`);
  console.log(`  Command:  ${config.command}${binaryPath ? ` (found at ${binaryPath})` : " (⚠ not in PATH)"}`);
  console.log(`  Runner:   ${config.runner}`);
  console.log(`  Args:     ${config.additional_args.join(" ") || "(none)"}`);
  console.log(`  Timeout:  ${config.timeout_seconds}s\n`);

  if (fromName) {
    console.log(`  Cloned from "${fromName}". Edit ${configPath} to customize further.`);
  }
  console.log();
}

/** hive-mcp remove <name> — delete a user config */
export function cmdRemove(args: string[]): void {
  const name = args[0];
  if (!name) {
    console.error("Usage: hive-mcp remove <name>");
    process.exit(1);
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    console.error(`Error: Invalid name "${name}". Use only letters, numbers, hyphens, underscores.`);
    process.exit(1);
  }

  const configPath = path.join(USER_CONF_DIR, `${name}.json`);
  if (!fs.existsSync(configPath)) {
    // Check if it's a built-in
    const builtinPath = path.join(CONF_DIR, `${name}.json`);
    if (fs.existsSync(builtinPath)) {
      console.error(`Error: "${name}" is a built-in config and cannot be removed.`);
    } else {
      console.error(`Error: No user config found for "${name}" at ${configPath}`);
    }
    process.exit(1);
  }

  fs.unlinkSync(configPath);
  console.log(`\n  ✓ Removed: ${configPath}\n`);
}

/** Print usage help */
export function cmdHelp(): void {
  console.log(`
Hive MCP — Multi-Agent CLI Orchestrator

Usage:
  hive-mcp                   Start MCP server (default)
  hive-mcp list              Show all CLI clients and their availability
  hive-mcp add <name> ...    Add a custom CLI client config
  hive-mcp remove <name>     Remove a user CLI client config
  hive-mcp help              Show this help

Add examples:
  # Clone an existing client with extra args
  hive-mcp add claude-zai --from claude --args "--model opus --settings ~/.claude-zai/settings.json"

  # Clone with different timeout
  hive-mcp add gemini-fast --from gemini --args "-m gemini-2.0-flash" --timeout 60

  # Create a new client from scratch
  hive-mcp add my-tool --command /usr/local/bin/mytool --runner base --timeout 120

Configs are saved to: ~/.hive/cli_clients/
`);
}

// ─── Helpers ─────────────────────────────────────────────────

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--") && i + 1 < args.length) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return flags;
}

function splitArgs(argsStr: string): string[] {
  // Split on spaces, respecting simple quotes
  const result: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (const ch of argsStr) {
    if (!inQuote && (ch === '"' || ch === "'")) {
      inQuote = true;
      quoteChar = ch;
    } else if (inQuote && ch === quoteChar) {
      inQuote = false;
    } else if (!inQuote && ch === " ") {
      if (current) result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  if (current) result.push(current);
  return result;
}
