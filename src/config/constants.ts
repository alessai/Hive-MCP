import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
export const CONF_DIR = path.join(PROJECT_ROOT, "conf", "cli_clients");
export const PROMPTS_DIR = path.join(PROJECT_ROOT, "prompts");
export const USER_CONF_DIR = path.join(os.homedir(), ".hive", "cli_clients");
export const THREADS_DIR = path.join(os.homedir(), ".hive", "threads");

export const DEFAULT_TIMEOUT_SECONDS = 300;
export const MAX_OUTPUT_CHARS = 20_000;
export const MAX_THREADS = 100;
export const THREAD_TTL_MS = 30 * 60 * 1000; // 30 minutes
