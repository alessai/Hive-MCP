export interface CLIClientConfig {
  name: string;
  command: string;
  runner?: string; // maps to agent class: "gemini" | "claude" | "codex" — omit for base
  additional_args?: string[];
  env?: Record<string, string>;
  timeout_seconds?: number;
  roles?: Record<string, RoleConfig>;
}

export interface RoleConfig {
  prompt_path?: string;
  role_args?: string[];
}

export interface InternalDefaults {
  parser: string;
  output_args: string[];
  prompt_injection: "stdin" | "flag";
  prompt_flag?: string;
  runner: string;
}

export interface ResolvedClient {
  name: string;
  command: string;
  /** Original config runner key; may differ from runner after defaults resolve to base. */
  config_runner: string;
  runner: string;
  parser: string;
  output_args: string[];
  additional_args: string[];
  prompt_injection: "stdin" | "flag";
  prompt_flag?: string;
  env: Record<string, string>;
  timeout_seconds: number;
  roles: Record<string, RoleConfig>;
}

export interface AgentRequest {
  client: string;
  role?: string;
  prompt: string;
  continuation_id?: string;
  cwd?: string;
  timeout_seconds?: number;
}

export interface AgentResponse {
  client: string;
  role: string;
  success: boolean;
  response: string;
  error?: string;
  duration_ms: number;
  truncated: boolean;
}

export interface ConsensusRequest {
  clients: string[];
  role?: string;
  prompt: string;
  cwd?: string;
  timeout_seconds?: number;
}

export interface ConsensusResponse {
  prompt: string;
  role: string;
  responses: AgentResponse[];
  summary: string;
}

export interface ConversationThread {
  id: string;
  turns: ConversationTurn[];
  created_at: number;
  last_used: number;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  client: string;
  timestamp: number;
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  aborted?: boolean;
}

export type ProgressCallback = (message: string, progress: number, total: number) => Promise<void>;
