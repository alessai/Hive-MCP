import fs from "node:fs";
import path from "node:path";
import { PROMPTS_DIR } from "../config/constants.js";

const SAFE_ROLE = /^[a-zA-Z0-9_-]+$/;

function resolveTemplate(role: string): string | null {
  if (!SAFE_ROLE.test(role)) return null;

  const templatePath = path.join(PROMPTS_DIR, `${role}.txt`);
  if (fs.existsSync(templatePath)) {
    return fs.readFileSync(templatePath, "utf-8");
  }

  const defaultPath = path.join(PROMPTS_DIR, "default.txt");
  if (fs.existsSync(defaultPath)) {
    return fs.readFileSync(defaultPath, "utf-8");
  }

  return null;
}

/**
 * Load a role's system prompt template.
 * Returns the template text with {{PROMPT}} stripped (for use as a system prompt),
 * or null if no template exists or role name is invalid.
 */
export function loadSystemPrompt(role: string): string | null {
  const template = resolveTemplate(role);
  if (!template) return null;
  return template.replace(/\{\{PROMPT\}\}/g, "").trimEnd();
}

/**
 * Load a role's prompt template and interpolate the user prompt into it.
 * Used when the entire prompt (system + user) must be sent as a single string.
 */
export function loadPrompt(role: string, userPrompt: string): string {
  const template = resolveTemplate(role);
  if (!template) return userPrompt;
  return template.replace(/\{\{PROMPT\}\}/g, userPrompt);
}
