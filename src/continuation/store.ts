import { MAX_THREADS, THREAD_TTL_MS } from "../config/constants.js";
import type { ConversationThread, ConversationTurn } from "../types.js";

const threads = new Map<string, ConversationThread>();

function isExpired(thread: ConversationThread): boolean {
  return Date.now() - thread.last_used > THREAD_TTL_MS;
}

function cleanup(): void {
  for (const [id, thread] of threads) {
    if (isExpired(thread)) {
      threads.delete(id);
    }
  }
}

function evict(): void {
  if (threads.size <= MAX_THREADS) return;

  const sorted = [...threads.entries()].sort(
    (a, b) => a[1].last_used - b[1].last_used,
  );

  const toRemove = sorted.length - MAX_THREADS;
  for (let i = 0; i < toRemove; i++) {
    threads.delete(sorted[i][0]);
  }
}

export function getThread(id: string): ConversationThread | undefined {
  cleanup();
  const thread = threads.get(id);
  if (!thread || isExpired(thread)) {
    if (thread) threads.delete(id);
    return undefined;
  }
  thread.last_used = Date.now();
  return thread;
}

export function createThread(id: string): ConversationThread {
  cleanup();
  evict();

  const thread: ConversationThread = {
    id,
    turns: [],
    created_at: Date.now(),
    last_used: Date.now(),
  };
  threads.set(id, thread);
  return thread;
}

export function addTurn(id: string, turn: ConversationTurn): void {
  const thread = threads.get(id);
  if (!thread) return;
  thread.turns.push(turn);
  thread.last_used = Date.now();
}

export function buildContext(id: string): string {
  const thread = threads.get(id);
  if (!thread || thread.turns.length === 0) return "";

  return thread.turns
    .map((t) => `--- [${t.client}] [${t.role}] ---\n${t.content}\n`)
    .join("");
}
