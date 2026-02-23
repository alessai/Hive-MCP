
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  MAX_THREADS,
  THREADS_DIR,
  THREAD_TTL_MS,
} from "../config/constants.js";
import type { ConversationThread, ConversationTurn } from "../types.js";

async function ensureThreadsDir(): Promise<void> {
  try {
    await fs.mkdir(THREADS_DIR, { recursive: true });
  } catch (error: any) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

const SAFE_ID = /^[a-zA-Z0-9_-]+$/;

function getThreadPath(id: string): string {
  if (!SAFE_ID.test(id)) {
    throw new Error(`Invalid continuation_id: must be alphanumeric, hyphens, or underscores`);
  }
  const resolved = path.resolve(THREADS_DIR, `${id}.json`);
  if (!resolved.startsWith(THREADS_DIR + path.sep)) {
    throw new Error(`Invalid continuation_id: path traversal detected`);
  }
  return resolved;
}

async function readThread(id: string): Promise<ConversationThread | undefined> {
  const filePath = getThreadPath(id);
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data) as ConversationThread;
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeThread(thread: ConversationThread): Promise<void> {
  await ensureThreadsDir();
  const filePath = getThreadPath(thread.id);
  await fs.writeFile(filePath, JSON.stringify(thread, null, 2));
}

async function deleteThread(id: string): Promise<void> {
  const filePath = getThreadPath(id);
  try {
    await fs.unlink(filePath);
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function isExpired(thread: ConversationThread): boolean {
  return Date.now() - thread.last_used > THREAD_TTL_MS;
}

async function cleanup(): Promise<void> {
  await ensureThreadsDir();
  const files = await fs.readdir(THREADS_DIR);
  for (const file of files) {
    if (path.extname(file) === ".json") {
      const id = path.basename(file, ".json");
      const thread = await readThread(id);
      if (thread && isExpired(thread)) {
        await deleteThread(id);
      }
    }
  }
}

async function evict(): Promise<void> {
  await ensureThreadsDir();
  const files = await fs.readdir(THREADS_DIR);
  const threads: ConversationThread[] = [];
  for (const file of files) {
    if (path.extname(file) === ".json") {
      const id = path.basename(file, ".json");
      const thread = await readThread(id);
      if (thread) {
        threads.push(thread);
      }
    }
  }

  if (threads.length <= MAX_THREADS) return;

  threads.sort((a, b) => a.last_used - b.last_used);

  const toRemove = threads.length - MAX_THREADS;
  for (let i = 0; i < toRemove; i++) {
    await deleteThread(threads[i].id);
  }
}

export async function getThread(
  id: string,
): Promise<ConversationThread | undefined> {
  await cleanup();
  const thread = await readThread(id);
  if (!thread || isExpired(thread)) {
    if (thread) await deleteThread(id);
    return undefined;
  }
  thread.last_used = Date.now();
  await writeThread(thread);
  return thread;
}

export async function createThread(id: string): Promise<ConversationThread> {
  await cleanup();
  await evict();

  const thread: ConversationThread = {
    id,
    turns: [],
    created_at: Date.now(),
    last_used: Date.now(),
  };
  await writeThread(thread);
  return thread;
}

export async function addTurn(
  id: string,
  turn: ConversationTurn,
): Promise<void> {
  const thread = await readThread(id);
  if (!thread) return;
  thread.turns.push(turn);
  thread.last_used = Date.now();
  await writeThread(thread);
}

export async function buildContext(id: string): Promise<string> {
  const thread = await readThread(id);
  if (!thread || thread.turns.length === 0) return "";

  return thread.turns
    .map((t) => `--- [${t.client}] [${t.role}] ---\n${t.content}\n`)
    .join("");
}
