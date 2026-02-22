# Hive MCP

An MCP server that spawns external AI CLIs as subagents. Give any MCP-compatible host (Claude Code, Cursor, Windsurf, etc.) the ability to delegate tasks to Gemini, Claude, Codex, or any custom CLI tool.

## What it does

Hive exposes two MCP tools:

- **`hivesingle`** — Spawn a single CLI agent with a role-specific system prompt
- **`hive`** — Spawn 2+ CLI agents in parallel with the same prompt, collect all responses

Each agent runs as a child process with full tool access (filesystem, shell, web search) — whatever the underlying CLI supports.

## Install

### Claude Code

```bash
claude mcp add hive -- npx hive-mcp
```

### Cursor / Windsurf / other MCP hosts

Add to your MCP config:

```json
{
  "hive": {
    "type": "stdio",
    "command": "npx",
    "args": ["hive-mcp"]
  }
}
```

### From source

```bash
git clone https://github.com/alessai/Hive-MCP.git
cd Hive-MCP
npm install && npm run build
claude mcp add hive node ./dist/index.js
```

## Prerequisites

You need the CLI tools installed for whichever agents you want to use:

| Agent | CLI | Install |
|-------|-----|---------|
| Gemini | `gemini` | `npm install -g @anthropic-ai/gemini-cli` or see [Gemini CLI docs](https://github.com/google-gemini/gemini-cli) |
| Claude | `claude` | `npm install -g @anthropic-ai/claude-code` or see [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code) |
| Codex | `codex` | See [Codex CLI docs](https://github.com/openai/codex) |

Only install the CLIs you plan to use. Hive will report a clear error if a CLI isn't found.

## Tools

### `hivesingle`

Spawn a single CLI agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `client` | string | yes | CLI client to use (`gemini`, `claude`, `codex`, `glm`, or custom) |
| `prompt` | string | yes | The task or question |
| `role` | string | no | Role-based system prompt (see [Roles](#roles)) |
| `continuation_id` | string | no | Thread ID for multi-turn conversations |
| `cwd` | string | no | Working directory for the CLI process |

### `hive`

Spawn multiple CLI agents in parallel with the same prompt. Defaults to `gemini` + `glm`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clients` | string[] | no | CLI clients to query (default: `["gemini", "glm"]`) |
| `prompt` | string | yes | The task or question |
| `role` | string | no | Role-based system prompt (see [Roles](#roles)) |
| `cwd` | string | no | Working directory for all CLI processes |

## Roles

Role prompts shape agent behavior. Each role injects a system prompt tailored for the task:

| Role | Purpose |
|------|---------|
| `default` | General-purpose assistant |
| `reviewer` | Code review — bugs, style, security |
| `debugger` | Systematic debugging and root cause analysis |
| `planner` | Break down tasks into implementation steps |
| `thinker` | Deep exploration before answering |
| `analyst` | Architecture and dependency analysis |
| `refactor` | Improve code structure without changing behavior |
| `testgen` | Generate comprehensive test cases |
| `secaudit` | Security audit (OWASP top 10, etc.) |
| `docgen` | Generate documentation |
| `precommit` | Pre-commit review checklist |
| `challenger` | Devil's advocate — find flaws and risks |
| `apilookup` | Find correct API usage and signatures |
| `tracer` | Trace execution flow through code |

All agents also receive a capabilities preamble reminding them they have full tool access (filesystem, shell, web).

## CLI client configuration

### Built-in clients

Hive ships with configs for 4 clients in `conf/cli_clients/`:

| Client | CLI | Model | Timeout |
|--------|-----|-------|---------|
| `gemini` | `gemini` | gemini-2.5-pro | 5 min |
| `claude` | `claude` | default | 30 min |
| `glm` | `claude` | opus | 30 min |
| `codex` | `codex` | default | 10 min |

### Custom clients

Add JSON files to `~/.hive/cli_clients/` to register custom clients or override built-ins.

```json
{
  "name": "my-agent",
  "command": "my-cli-tool",
  "runner": "gemini",
  "additional_args": ["--flag", "value"],
  "env": {},
  "timeout_seconds": 300,
  "roles": {}
}
```

**Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Client name (used in tool calls) |
| `command` | string | CLI executable name or path |
| `runner` | string | Agent behavior: `"gemini"`, `"claude"`, `"codex"`, or omit for base |
| `additional_args` | string[] | Extra CLI arguments |
| `env` | object | Environment variables for the process |
| `timeout_seconds` | number | Process timeout (default: 300) |
| `roles` | object | Per-role overrides (optional) |

The `runner` field determines how Hive interacts with the CLI:

| Runner | System prompt | Output format | Parser |
|--------|--------------|---------------|--------|
| `gemini` | via `-p` flag | JSON (`-o json`) | Extracts from Gemini JSON response |
| `claude` | via `--append-system-prompt` flag | JSON (`--output-format json`) | Extracts from Claude JSONL events |
| `codex` | via stdin | JSONL (`exec --json`) | Extracts from Codex JSONL stream |
| base (default) | via stdin | raw text | Returns stdout as-is |

User configs in `~/.hive/cli_clients/` override built-in configs with the same name.

## Multi-turn conversations

Pass a `continuation_id` to `hivesingle` to maintain context across calls. Hive stores conversation turns on disk (`~/.hive/threads/`) with a 30-minute TTL and 100-thread LRU cap.

```
# First call
hivesingle(client: "gemini", prompt: "Explain this codebase", continuation_id: "session-1")

# Follow-up (context is preserved)
hivesingle(client: "gemini", prompt: "Now focus on the auth module", continuation_id: "session-1")
```

## How it works

```
MCP Host (Claude Code, Cursor, etc.)
    ↓ MCP tool call
Hive MCP Server
    ↓ child_process.spawn()
CLI Agent (gemini, claude, codex)
    ↓ stdout/stderr
Parse output → return to host
```

1. The MCP host calls `hivesingle` or `hive`
2. Hive resolves the client config, loads the role prompt, and builds CLI arguments
3. The CLI is spawned as a child process with the prompt piped via stdin or flags
4. Hive streams progress notifications back to the host while waiting
5. On completion, the output is parsed (JSON/JSONL/raw) and returned

Each agent runs in its own process with full access to whatever tools the CLI provides. Hive is just the bridge.

## Project structure

```
├── conf/cli_clients/     # Built-in CLI client configs (JSON)
├── prompts/              # 14 role-based system prompt templates
├── src/
│   ├── index.ts          # MCP server entry point, tool registration
│   ├── types.ts          # TypeScript interfaces
│   ├── agents/           # CLI agent implementations (base, gemini, claude, codex)
│   ├── config/           # Config loading, internal defaults, constants
│   ├── parsers/          # Output parsers (gemini JSON, claude JSONL, codex JSONL, raw)
│   ├── prompts/          # Prompt template loader
│   ├── continuation/     # Multi-turn conversation store
│   └── tools/            # Tool handlers (hivesingle, hive consensus)
├── dist/                 # Compiled output (gitignored)
└── package.json
```

## Development

```bash
npm run dev     # Watch mode (recompiles on changes)
npm run build   # One-time build
npm start       # Run the server directly
```

## License

[MIT](LICENSE)
