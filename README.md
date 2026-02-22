# Hive MCP

**Why rely on one AI model when you can orchestrate them all?**

Hive is an MCP server that lets any AI coding assistant — Claude Code, Cursor, Windsurf, or any MCP host — spawn and coordinate external AI CLIs as subagents. Delegate tasks to Gemini, Claude, Codex, or any custom CLI tool. Each agent runs with **full tool access** (filesystem, shell, web search), and results flow right back into your session.

Think of it as giving your AI assistant a team of other AI assistants it can call on whenever it needs a second opinion, a specialized skill, or just more hands on deck.

## Why Hive?

**One model isn't always enough.** Different models have different strengths — Gemini is fast with broad knowledge, Claude is precise with code, Codex runs sandboxed. Hive lets you play to each model's strengths without leaving your workflow.

- **Multi-model consensus** — Ask the same question to 2+ models in parallel, get diverse perspectives, catch blind spots
- **Delegate and forget** — Hand off research, code review, or analysis to a subagent while your main session keeps working
- **14 built-in roles** — Reviewer, debugger, security auditor, test generator, and more — each with a tuned system prompt
- **Multi-turn memory** — Agents remember previous conversations within a session, so you can build on earlier context
- **Fully extensible** — Add any CLI tool as a custom agent in minutes with a simple JSON config

## Install

### Claude Code

```bash
claude mcp add hive -- npx @alessai/hive-mcp
```

### Cursor / Windsurf / other MCP hosts

Add to your MCP config:

```json
{
  "hive": {
    "type": "stdio",
    "command": "npx",
    "args": ["@alessai/hive-mcp"]
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

Install whichever CLIs you want to use as agents:

| Agent | CLI | Install |
|-------|-----|---------|
| Gemini | `gemini` | See [Gemini CLI](https://github.com/google-gemini/gemini-cli) |
| Claude | `claude` | See [Claude Code](https://docs.anthropic.com/en/docs/claude-code) |
| Codex | `codex` | See [Codex CLI](https://github.com/openai/codex) |

You only need the ones you plan to use. Hive gives a clear error if a CLI isn't found.

## Examples

### Get a second opinion on your code

> *"Use hive to review this pull request with both Gemini and Claude"*

Hive spawns both models in parallel with the `reviewer` role. You get two independent code reviews in one shot — different models catch different things.

### Multi-model debate

> *"Use hive with the challenger role to find flaws in this architecture proposal"*

Both agents independently poke holes in your design. Where they agree, you likely have a real problem. Where they disagree, you get interesting perspectives to consider.

### Delegate research while you keep coding

> *"Use hivesingle with Gemini to research the best pagination strategy for GraphQL APIs"*

Gemini goes off and searches the web, reads docs, and comes back with a structured answer — while your main session stays focused on implementation.

### Security audit from multiple angles

> *"Use hive with the secaudit role to audit the auth module"*

Two models independently audit your code for OWASP top 10, injection risks, auth bypass, and more. Redundancy catches what a single pass misses.

### Generate tests, then challenge them

> *"Use hivesingle with gemini and the testgen role to generate tests for src/auth.ts"*
>
> *"Now use hivesingle with claude and the challenger role to find gaps in those tests"*

Chain different agents with different roles. One generates, another critiques. The result is more thorough than either alone.

### Pre-commit sanity check

> *"Use hive with the precommit role to review my staged changes"*

Both models run through a pre-commit checklist: missing tests, security issues, leftover debug code, breaking API changes. Catch problems before they hit CI.

### API lookup with fresh data

> *"Use hivesingle with gemini and the apilookup role to find the correct API for streaming responses in the Vercel AI SDK"*

Models have training cutoffs. Gemini CLI has web search built in — it can find current API docs, correct method signatures, and working examples instead of hallucinating outdated patterns.

### Deep architecture analysis

> *"Use hivesingle with the analyst role to analyze the dependency graph of this project"*

The agent reads your codebase, maps out architecture patterns, identifies coupling issues, and flags structural concerns — with full filesystem access to actually look at the code.

### Multi-turn investigation

> *"Use hivesingle with gemini to explain the auth flow in this codebase" (continuation_id: "auth-investigation")*
>
> *"Now trace what happens when a token expires" (continuation_id: "auth-investigation")*

Same `continuation_id` means the agent remembers the previous conversation. Build up understanding across multiple exchanges without re-explaining context.

## Use cases at a glance

| Scenario | Tool | Role | Why it works |
|----------|------|------|-------------|
| Code review | `hive` | `reviewer` | Two models catch more bugs than one |
| Find security holes | `hive` | `secaudit` | Redundant auditing, different heuristics |
| Challenge a design | `hive` | `challenger` | Independent devil's advocates |
| Research a topic | `hivesingle` | `default` | Delegate web-connected research |
| Generate tests | `hivesingle` | `testgen` | Focused test generation with full code access |
| Debug a tricky issue | `hivesingle` | `debugger` | Systematic root cause analysis |
| Plan implementation | `hivesingle` | `planner` | Break down tasks before coding |
| Pre-commit check | `hive` | `precommit` | Last line of defense before pushing |
| Look up current APIs | `hivesingle` | `apilookup` | Web-connected agents find fresh docs |
| Trace code flow | `hivesingle` | `tracer` | Follow execution paths through your codebase |
| Refactor safely | `hivesingle` | `refactor` | Restructure code with full context |
| Generate docs | `hivesingle` | `docgen` | Documentation from actual code, not guesses |

## Tools

### `hivesingle`

Spawn a single CLI agent with a task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `client` | string | yes | CLI client: `gemini`, `claude`, `codex`, `glm`, or custom |
| `prompt` | string | yes | The task or question |
| `role` | string | no | Role prompt (see [Roles](#roles)) |
| `continuation_id` | string | no | Thread ID for multi-turn conversations |
| `cwd` | string | no | Working directory for the CLI process |

### `hive`

Spawn 2+ CLI agents in parallel with the same prompt. Defaults to `gemini` + `glm`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clients` | string[] | no | CLI clients to query (default: `["gemini", "glm"]`) |
| `prompt` | string | yes | The task or question |
| `role` | string | no | Role prompt (see [Roles](#roles)) |
| `cwd` | string | no | Working directory |

## Roles

Each role injects a tailored system prompt that shapes how the agent approaches your task:

| Role | What it does |
|------|-------------|
| `default` | General-purpose assistant |
| `reviewer` | Code review — bugs, style, security, maintainability |
| `debugger` | Systematic debugging and root cause analysis |
| `planner` | Break down tasks into ordered implementation steps |
| `thinker` | Deep exploration — consider tradeoffs before answering |
| `analyst` | Architecture patterns, dependency analysis, structural concerns |
| `refactor` | Improve code structure without changing behavior |
| `testgen` | Generate comprehensive tests: happy paths, edge cases, error conditions |
| `secaudit` | Security audit — OWASP top 10, injection, auth bypass, data exposure |
| `docgen` | Generate clear documentation from code |
| `precommit` | Pre-commit checklist: tests, security, debug code, breaking changes |
| `challenger` | Devil's advocate — find flaws, challenge assumptions, identify risks |
| `apilookup` | Find correct, current API usage with method signatures and examples |
| `tracer` | Trace execution flow through function calls and state changes |

All agents also get a capabilities preamble reminding them to use their tools (filesystem, shell, web search) when needed.

## Configuration

### Built-in clients

| Client | CLI | Model | Timeout |
|--------|-----|-------|---------|
| `gemini` | `gemini` | gemini-2.5-pro | 5 min |
| `claude` | `claude` | default | 30 min |
| `glm` | `claude` | opus | 30 min |
| `codex` | `codex` | default | 10 min |

### Add your own agents

Drop a JSON file in `~/.hive/cli_clients/` to add any CLI tool as an agent:

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

The `runner` field tells Hive how to communicate with the CLI:

| Runner | System prompt via | Output format | Use for |
|--------|------------------|---------------|---------|
| `gemini` | `-p` flag | JSON | Gemini-compatible CLIs |
| `claude` | `--append-system-prompt` flag | JSON | Claude-compatible CLIs |
| `codex` | stdin | JSONL | Codex-compatible CLIs |
| base (default) | stdin | raw text | Any CLI that reads stdin and writes stdout |

User configs in `~/.hive/cli_clients/` override built-in configs with the same name.

## Multi-turn conversations

Pass a `continuation_id` to maintain context across multiple calls:

```
# First call
hivesingle(client: "gemini", prompt: "Explain this codebase", continuation_id: "session-1")

# Follow-up — the agent remembers the previous exchange
hivesingle(client: "gemini", prompt: "Now focus on the auth module", continuation_id: "session-1")
```

Conversations are stored on disk (`~/.hive/threads/`) with a 30-minute TTL and 100-thread LRU eviction.

## How it works

```
MCP Host (Claude Code, Cursor, etc.)
    ↓ MCP tool call
Hive MCP Server
    ↓ child_process.spawn()
CLI Agent (gemini, claude, codex, custom)
    ↓ stdout/stderr
Parse output → return to host
```

1. Your MCP host calls `hivesingle` or `hive`
2. Hive resolves the client config, loads the role prompt, builds CLI arguments
3. The CLI is spawned as a child process with the prompt piped via stdin or flags
4. Progress notifications stream back to the host while waiting
5. Output is parsed (JSON/JSONL/raw) and returned to your session

Each agent runs in its own process with full access to whatever tools the underlying CLI provides — filesystem, shell, web search, code execution. Hive is just the bridge.

## Development

```bash
npm run dev     # Watch mode
npm run build   # One-time build
npm start       # Run the server
```

## License

[MIT](LICENSE)
