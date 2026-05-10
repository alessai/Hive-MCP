import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { log } from "../log.js";

const USAGE_DIR = path.join(os.homedir(), ".hive");
const USAGE_FILE = path.join(USAGE_DIR, "model_usage.json");

export interface ClientUsage {
  count: number;
  last_used: number;
}

interface UsageFile {
  clients: Record<string, ClientUsage>;
}

async function readUsage(): Promise<UsageFile> {
  try {
    const raw = await fs.readFile(USAGE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as UsageFile;
    return { clients: parsed.clients ?? {} };
  } catch (err: any) {
    if (err?.code === "ENOENT") return { clients: {} };
    log("Failed to read Hive model usage", "WARN", { error: err?.message ?? String(err) });
    return { clients: {} };
  }
}

async function writeUsage(usage: UsageFile): Promise<void> {
  await fs.mkdir(USAGE_DIR, { recursive: true });
  await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2) + "\n");
}

export async function recordClientUse(client: string): Promise<void> {
  try {
    const usage = await readUsage();
    const existing = usage.clients[client] ?? { count: 0, last_used: 0 };
    usage.clients[client] = {
      count: existing.count + 1,
      last_used: Date.now(),
    };
    await writeUsage(usage);
  } catch (err) {
    log("Failed to update Hive model usage", "WARN", { error: err instanceof Error ? err.message : String(err) });
  }
}

export async function getClientUsage(): Promise<Record<string, ClientUsage>> {
  return (await readUsage()).clients;
}

export async function rankClientsByUsage(clients: string[]): Promise<string[]> {
  const usage = await getClientUsage();
  return [...clients].sort((a, b) => {
    const ua = usage[a];
    const ub = usage[b];
    const recentDiff = (ub?.last_used ?? 0) - (ua?.last_used ?? 0);
    if (recentDiff !== 0) return recentDiff;
    const countDiff = (ub?.count ?? 0) - (ua?.count ?? 0);
    if (countDiff !== 0) return countDiff;
    const defaultRankDiff = defaultClientRank(b) - defaultClientRank(a);
    if (defaultRankDiff !== 0) return defaultRankDiff;
    return a.localeCompare(b);
  });
}

function defaultClientRank(client: string): number {
  const model = client.startsWith("opencode:") ? client.slice("opencode:".length) : client;
  const providerScore = model.startsWith("opencode-go/") ? 1000
    : model.startsWith("zai-coding-plan/") ? 900
    : model.startsWith("openai/") ? 800
    : model.startsWith("minimax/") ? 700
    : 0;

  const numbers = [...model.matchAll(/\d+(?:\.\d+)?/g)]
    .map(match => match[0].split(".").reduce((score, part, idx) => score + Number(part) / Math.pow(10, idx), 0));
  const versionScore = numbers.length > 0 ? Math.max(...numbers) * 100 : 0;
  const variantScore = model.includes("-pro") ? 20
    : model.includes("-plus") ? 15
    : model.includes("-turbo") ? 2
    : model.includes("-flash") ? 5
    : 0;
  return providerScore + versionScore + variantScore;
}

export async function describeUsage(client: string): Promise<string> {
  const usage = (await getClientUsage())[client];
  if (!usage) return "not used yet";
  return `${usage.count} uses, last ${new Date(usage.last_used).toLocaleString()}`;
}
