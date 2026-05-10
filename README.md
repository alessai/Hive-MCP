# Hive MCP

**Why rely on one AI model when you can orchestrate them all?**

Hive is an MCP server that lets any AI coding assistant — Claude Code, Cursor, Windsurf, or any MCP host — spawn and coordinate external AI CLIs as subagents. Delegate tasks to Gemini, Claude, Qwen, Kilo Code, OpenCode, Codex, any model available through OpenCode, or any custom CLI tool. Each agent runs with **full tool access** (filesystem, shell, web search), and results flow right back into your session.

Hive **auto-detects** which CLIs you have installed — no configuration needed. Just install and go.

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
| Qwen | `qwen` | See [Qwen Code](https://github.com/QwenLM/qwen-code) |
| Kilo Code | `kilocode` | See [Kilo Code](https://github.com/kilocode/kilocode) |
| OpenCode | `opencode` | See [OpenCode](https://github.com/nichochar/opencode) |
| Codex | `codex` | See [Codex CLI](https://github.com/openai/codex) |

You only need the ones you plan to use. Hive **auto-detects** which CLIs are in your PATH at startup and only advertises the ones it finds. No configuration needed — install a CLI and it just works.

## Examples

### Get a second opinion on your code

> *"Use hive to review this pull request with both Gemini and Claude"*

Hive spawns both models in parallel with the `reviewer` role. You get two independent code reviews in one shot — different models catch different things.

### Multi-model debate

> *"Use hive with the challenger role to find flaws in this architecture proposal"*

Both agents independently poke holes in your design. Where they agree, you likely have a real problem. Where they disagree, you get interesting perspectives to consider.

### Delegate research while you keep coding

> *"Use hive with Gemini to research the best pagination strategy for GraphQL APIs"*

Gemini goes off and searches the web, reads docs, and comes back with a structured answer — while your main session stays focused on implementation.

### Security audit from multiple angles

> *"Use hive with the secaudit role to audit the auth module"*

Two models independently audit your code for OWASP top 10, injection risks, auth bypass, and more. Redundancy catches what a single pass misses.

### Generate tests, then challenge them

> *"Use hive with gemini and the testgen role to generate tests for src/auth.ts"*
>
> *"Now use hive with claude and the challenger role to find gaps in those tests"*

Chain different agents with different roles. One generates, another critiques. The result is more thorough than either alone.

### Pre-commit sanity check

> *"Use hive with the precommit role to review my staged changes"*

Both models run through a pre-commit checklist: missing tests, security issues, leftover debug code, breaking API changes. Catch problems before they hit CI.

### API lookup with fresh data

> *"Use hive with gemini and the apilookup role to find the correct API for streaming responses in the Vercel AI SDK"*

Models have training cutoffs. Gemini CLI has web search built in — it can find current API docs, correct method signatures, and working examples instead of hallucinating outdated patterns.

### Deep architecture analysis

> *"Use hive with the analyst role to analyze the dependency graph of this project"*

The agent reads your codebase, maps out architecture patterns, identifies coupling issues, and flags structural concerns — with full filesystem access to actually look at the code.

### Multi-turn investigation

> *"Use hive with gemini to explain the auth flow in this codebase" (continuation_id: "auth-investigation")*
>
> *"Now trace what happens when a token expires" (continuation_id: "auth-investigation")*

Same `continuation_id` means the agent remembers the previous conversation. Build up understanding across multiple exchanges without re-explaining context.

## Use cases at a glance

| Scenario | Tool | Role | Why it works |
|----------|------|------|-------------|
| Code review | `hive` | `reviewer` | Two models catch more bugs than one |
| Find security holes | `hive` | `secaudit` | Redundant auditing, different heuristics |
| Challenge a design | `hive` | `challenger` | Independent devil's advocates |
| Research a topic | `hive` | `default` | Delegate web-connected research with one client |
| Generate tests | `hive` | `testgen` | Focused test generation with full code access |
| Debug a tricky issue | `hive` | `debugger` | Systematic root cause analysis |
| Plan implementation | `hive` | `planner` | Break down tasks before coding |
| Pre-commit check | `hive` | `precommit` | Last line of defense before pushing |
| Look up current APIs | `hive` | `apilookup` | Web-connected agents find fresh docs |
| Trace code flow | `hive` | `tracer` | Follow execution paths through your codebase |
| Refactor safely | `hive` | `refactor` | Restructure code with full context |
| Generate docs | `hive` | `docgen` | Documentation from actual code, not guesses |

## Tools

### `hive`

Spawn one or more CLI agents with the same prompt. Pass one client for a single-agent run, or multiple clients for a parallel consensus-style run. If `clients` is omitted, Hive asks which model(s)/client(s) to use.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `clients` | string[] | no | CLI clients to query. Pass one or many. Omit it to choose one or more ranked available models/clients. If your MCP host incorrectly requires this field, pass `["__select_models__"]` or use `hivepick`. |
| `prompt` | string | yes | The task or question |
| `role` | string | no | Role prompt (see [Roles](#roles)) |
| `continuation_id` | string | no | Thread ID for single-client runs; ignored for multi-client runs |
| `cwd` | string | no | Working directory |
| `timeout_seconds` | number | no | Per-agent timeout override, 1–7200 seconds |
| `background` | boolean | no | Return a job ID immediately instead of waiting for all agents |
| `wait_seconds` | number | no | Seconds to wait before returning a background job ID; defaults to 45 |
| `run_id` | string | no | Optional group ID shared by related Hive jobs |

Long-running calls automatically fall back to a background job after `wait_seconds` so MCP hosts do not time out before a review finishes. Fetch or cancel the job with `hivejob`. Jobs live in the current Hive MCP server session; restart the server and running/in-memory job results are gone.

For multi-model reviews, pass the same `run_id` to every `hive` call, then use `hivejob({ action: "collect", run_id: "..." })`. This returns one compact progress/result payload so the orchestrating agent does not blindly poll scattered job IDs.

### `hivepick`

Compatibility wrapper for hosts that cache or require `hive.clients`. It has the same behavior as `hive` with omitted clients: Hive asks which one or more models/clients to use, or returns `MODEL_SELECTION_REQUIRED` if the host cannot ask.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | yes | The task or question |
| `role` | string | no | Role prompt (see [Roles](#roles)) |
| `cwd` | string | no | Working directory |
| `timeout_seconds` | number | no | Per-agent timeout override, 1–7200 seconds |
| `background` | boolean | no | Return a job ID immediately instead of waiting for all agents |
| `wait_seconds` | number | no | Seconds to wait before returning a background job ID; defaults to 45 |
| `run_id` | string | no | Optional group ID shared by related Hive jobs |

### `hivejob`

Inspect or cancel background jobs created by `hive`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `get` \| `list` \| `cancel` \| `collect` | yes | Operation to perform; use `collect` for run-level status/results |
| `job_id` | string | for `get` / `cancel` | Job ID returned by a long-running call |
| `run_id` | string | for filtered `list` / recommended for `collect` | Group ID passed to related jobs |
| `include_result` | boolean | no | Include completed output for `get` / `collect`; defaults to true |

`hivejob collect` returns JSON with counts, elapsed seconds, next recommended poll interval, structured job statuses, and completed outputs. This is the preferred way to manage long-running multi-model reviews.

### OpenCode model clients

At MCP startup, Hive asks OpenCode for the models available in your current auth/config and registers each one as a Hive client named `opencode:<provider/model>`. Nested provider routes are supported too, for example `opencode:openrouter/anthropic/claude-opus-4.7`. If you add or remove OpenCode providers later, restart the Hive MCP server and the list updates automatically.

Any model listed by OpenCode can also be used directly without adding a Hive config:

```text
hive(clients: ["opencode:openai/gpt-5.5"], prompt: "Review this module")
hive(clients: ["opencode:openrouter/anthropic/claude-opus-4.7"], prompt: "Review this module")
hive(clients: ["opencode:zai-coding-plan/glm-5.1", "opencode:openai/gpt-5.5"], prompt: "Compare these approaches")
```

For compatibility with direct OpenCode model IDs, Hive also accepts the bare model route (for example `openrouter/anthropic/claude-opus-4.7`) and runs it through OpenCode.

List available OpenCode-backed client names with:

```bash
hive-mcp models
```

From an MCP host, call the `hivemodels` tool for the same list. You can filter by provider, for example `provider: "opencode-go"`.

If you omit `clients`, or pass an ambiguous model family such as `glm`, `kimi`, or `deepseek`, Hive will ask you which discovered model/client you meant. Choices are ranked by your recent/frequent usage and capped to the top 5. Omitted clients require selecting one or more models, and ambiguous entries support selecting multiple models.

Some MCP hosts, including current OpenCode MCP hosting, do not implement the standard `elicitation/create` request even though OpenCode has its own built-in `question` tool for LLM conversations. In those hosts, Hive returns a `MODEL_SELECTION_REQUIRED` response with structured JSON listing exact client choices. The primary agent should ask the user in chat and call Hive again with the selected exact `opencode:<provider/model>` names.

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

## CLI Management

Hive includes built-in commands for managing your CLI client configs. No manual JSON editing required.

### See what's available

```bash
hive-mcp list
```

```
  Status  Name            Command         Source
  ─────── ─────────────── ─────────────── ──────────────────────────
  ✓     claude          claude          built-in
  ✓     gemini          gemini          built-in
  ✗     codex           codex           built-in
          └─ Install: npm i -g @openai/codex

  OpenCode model clients: use opencode:<provider/model>
  Example: opencode:openai/gpt-5.5
```

### Add custom CLI configs

Clone an existing client with extra args — perfect for model variants:

```bash
# OpenCode with a specific model alias
hive-mcp add gpt55 --from opencode --args "--model openai/gpt-5.5" --timeout 600

# Gemini with Flash model and shorter timeout
hive-mcp add gemini-fast --from gemini --args "-m gemini-2.0-flash" --timeout 60
```

Or create a completely new client:

```bash
hive-mcp add my-tool --command /usr/local/bin/mytool --runner base --timeout 120
```

### Remove custom configs

```bash
hive-mcp remove claude-zai
```

Only user configs can be removed. Built-in configs are protected.

### All commands

| Command | Description |
|---------|-------------|
| `hive-mcp` | Start MCP server (default) |
| `hive-mcp list` | Show all clients with availability status |
| `hive-mcp models` | Show OpenCode models as `opencode:<provider/model>` client names |
| `hive-mcp logs [--tail N]` | Show recent Hive MCP logs |
| `hive-mcp add <name>` | Add a custom CLI config |
| `hive-mcp remove <name>` | Remove a user CLI config |
| `hive-mcp help` | Show help |

## Configuration

### Built-in clients

| Client | CLI | Model | Timeout |
|--------|-----|-------|---------|
| `gemini` | `gemini` | gemini-2.5-flash | 5 min |
| `claude` | `claude` | default | 30 min |
| `qwen` | `qwen` | default | 5 min |
| `kilo` | `kilocode` | default | 5 min |
| `opencode` | `opencode` | default | 5 min |
| `codex` | `codex` | default | 10 min |

### Add your own agents

The easiest way is with the CLI:

```bash
hive-mcp add my-agent --from gemini --args "--flag value" --timeout 300
```

Or drop a JSON file in `~/.hive/cli_clients/` manually:

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
| `opencode` | stdin | JSONL | OpenCode-compatible CLIs |
| `qwen` | stdin | JSON | Qwen Code (uses Claude-compatible output format) |
| `kilo` | stdin | JSONL | Kilo Code CLIs |
| `codex` | stdin | JSONL | Codex-compatible CLIs |
| base (default) | stdin | raw text | Any CLI that reads stdin and writes stdout |

User configs in `~/.hive/cli_clients/` override built-in configs with the same name.

## Multi-turn conversations

Pass a `continuation_id` to maintain context across multiple calls:

```
# First call
hive(clients: ["gemini"], prompt: "Explain this codebase", continuation_id: "session-1")

# Follow-up — the agent remembers the previous exchange
hive(clients: ["gemini"], prompt: "Now focus on the auth module", continuation_id: "session-1")
```

Conversations are stored on disk (`~/.hive/threads/`) with a 30-minute TTL and 100-thread LRU eviction.

## Logging and timeouts

Hive writes MCP-safe logs to stderr and to:

```bash
~/.hive/logs/hive-mcp.log
```

Useful commands:

```bash
hive-mcp logs              # show recent log lines
hive-mcp logs --tail 200   # show more lines
hive-mcp logs --path       # print the log file path
```

Every spawned CLI has a timeout. Defaults come from the client config, and individual tool calls can override them with `timeout_seconds`. On timeout, Hive sends `SIGTERM`, escalates to `SIGKILL`, returns any partial stdout/stderr it captured, and logs output sizes plus exit details.

MCP hosts often have their own shorter request timeout. To avoid losing long reviews, `hive` waits up to `wait_seconds` (45s by default) and then returns a `hivejob` ID while the agent continues in the background. If the MCP caller cancels before a job ID is returned, Hive now aborts the child process group so stale agents do not keep running.

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

1. Your MCP host calls `hive`
2. Hive resolves the client config, loads the role prompt, builds CLI arguments
3. The CLI is spawned as a child process with the prompt piped via stdin or flags
4. Progress notifications stream back to the host while waiting
5. Output is parsed (JSON/JSONL/raw) and returned to your session, or stored on a background `hivejob` for later retrieval

Each agent runs in its own process with full access to whatever tools the underlying CLI provides — filesystem, shell, web search, code execution. Hive is just the bridge.

## Security

Hive spawns child processes, so security matters. Here's what it does:

- **Auto-detection** — Only CLIs actually found in PATH are registered; missing binaries are silently skipped
- **No shell injection** — Uses `spawn()` with argument arrays, never shell interpolation
- **Path traversal protection** — `continuation_id` and role names are validated against strict alphanumeric patterns
- **Environment filtering** — Sensitive env vars (`*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `PRIVATE_KEY`, `DATABASE_URL`, `GITHUB_TOKEN`, etc.) are stripped before passing to child processes
- **Concurrency limits** — Max 5 simultaneous child processes to prevent resource exhaustion
- **CWD validation** — The `cwd` parameter is validated to be an existing directory before spawning
- **Config validation** — User configs are validated for required fields, sane timeout bounds (1s–2hr), and dangerous env vars (`LD_PRELOAD`, etc.) are blocked
- **Timeout enforcement** — Every child process has a timeout with SIGTERM → SIGKILL escalation

**Things to be aware of:**

- **Custom clients can run any executable.** Files in `~/.hive/cli_clients/` define the `command` that gets spawned. Only add configs you trust.
- **Built-in Claude/OpenCode configs auto-approve permissions.** Claude uses `bypassPermissions`; OpenCode uses `--dangerously-skip-permissions`. This means spawned agents can read/write/execute without human approval. Override in `~/.hive/cli_clients/` if you want stricter defaults.
- **Agents inherit most of your environment.** CLI tools like Gemini and Claude need their API keys from the environment to function. Hive strips known secrets but passes the rest.

## Development

```bash
npm run dev     # Watch mode
npm run build   # One-time build
npm test        # Run the test suite
npm start       # Run the server
```

## License

[MIT](LICENSE)
