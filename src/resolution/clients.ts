import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import { ElicitResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { getClient, listClients } from "../config/registry.js";
import { describeUsage, rankClientsByUsage } from "../models/usage.js";
import { log } from "../log.js";

export class ClientResolutionError extends Error {
  constructor(message: string, public readonly candidates: string[] = []) {
    super(message);
    this.name = "ClientResolutionError";
  }
}

export const MODEL_SELECTION_SENTINEL = "__select_models__";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isModelSelectionSentinel(value: string): boolean {
  const normalized = normalize(value);
  return new Set([
    "selectmodel",
    "selectmodels",
    "choosemodel",
    "choosemodels",
    "pickmodel",
    "pickmodels",
    "askmodel",
    "askmodels",
    "modelselect",
    "modelselection",
  ]).has(normalized);
}

function isModelSelectionRequest(clients: string[]): boolean {
  const normalized = clients.map(normalize).filter(Boolean);
  if (normalized.length === 0) return false;
  if (normalized.every(isModelSelectionSentinel)) return true;
  return isModelSelectionSentinel(normalized.join(""));
}

function clientModelPart(client: string): string {
  return client.startsWith("opencode:") ? client.slice("opencode:".length) : client;
}

export async function findClientCandidates(query: string, limit = 5): Promise<string[]> {
  const exact = getClient(query);
  if (exact && query.startsWith("opencode:")) return [query];

  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  const modelClients = listClients().filter(name => name.startsWith("opencode:"));
  const matches = modelClients.filter(client => {
    const model = clientModelPart(client);
    return normalize(model).includes(normalizedQuery) || normalize(client).includes(normalizedQuery);
  });

  // If there is an exact non-OpenCode client and no model ambiguity, keep it exact.
  if (exact && matches.length === 0) return [query];

  const ranked = await rankClientsByUsage(matches);
  return ranked.slice(0, limit);
}

async function optionTitle(client: string): Promise<string> {
  const usage = await describeUsage(client);
  return `${client} (${usage})`;
}

async function askForSingleClient(
  query: string,
  candidates: string[],
  extra: RequestHandlerExtra<any, any>,
  message = `Which model did you mean by "${query}"?`,
): Promise<string> {
  const oneOf = await Promise.all(candidates.map(async client => ({
    const: client,
    title: await optionTitle(client),
  })));

  const result = await extra.sendRequest({
    method: "elicitation/create",
    params: {
      mode: "form",
      message,
      requestedSchema: {
        type: "object",
        properties: {
          client: {
            type: "string",
            title: "Model",
            oneOf,
            default: candidates[0],
          },
        },
        required: ["client"],
      },
    },
  } as any, ElicitResultSchema as any, { timeout: 60_000 }) as any;

  if (result.action !== "accept") {
    throw new ClientResolutionError(`Model selection for "${query}" was ${result.action}.`, candidates);
  }
  const selected = result.content?.client;
  if (typeof selected !== "string" || !candidates.includes(selected)) {
    throw new ClientResolutionError(`Invalid model selection for "${query}".`, candidates);
  }
  return selected;
}

async function askForMultipleClients(
  query: string,
  candidates: string[],
  extra: RequestHandlerExtra<any, any>,
  minItems = 1,
  message = `Which models did you mean by "${query}"? Choose one or more.`,
): Promise<string[]> {
  const anyOf = await Promise.all(candidates.map(async client => ({
    const: client,
    title: await optionTitle(client),
  })));

  const result = await extra.sendRequest({
    method: "elicitation/create",
    params: {
      mode: "form",
      message,
      requestedSchema: {
        type: "object",
        properties: {
          clients: {
            type: "array",
            title: "Models",
            minItems,
            maxItems: candidates.length,
            items: { anyOf },
            default: candidates.slice(0, Math.min(Math.max(minItems, 1), candidates.length)),
          },
        },
        required: ["clients"],
      },
    },
  } as any, ElicitResultSchema as any, { timeout: 60_000 }) as any;

  if (result.action !== "accept") {
    throw new ClientResolutionError(`Model selection for "${query}" was ${result.action}.`, candidates);
  }
  const selected = result.content?.clients;
  if (!Array.isArray(selected) || selected.length < minItems || selected.some(c => typeof c !== "string" || !candidates.includes(c))) {
    throw new ClientResolutionError(`Invalid model selection for "${query}".`, candidates);
  }
  return selected;
}

export async function findDefaultClientCandidates(limit = 5): Promise<string[]> {
  const clients = listClients();
  const modelClients = clients.filter(name => name.startsWith("opencode:"));
  const pool = modelClients.length > 0 ? modelClients : clients;
  return (await rankClientsByUsage(pool)).slice(0, limit);
}

interface CandidateGroup {
  query: string;
  candidates: string[];
  minSelections?: number;
}

function selectionRequiredMessage(groups: CandidateGroup[], cause?: string): string {
  const payload = {
    type: "model_selection_required",
    cause: cause ?? "MCP host did not complete model selection",
        instructions: "Ask the user to choose exact client names, then call hive again with those exact names.",
    groups: groups.map(group => ({
      query: group.query,
      minSelections: group.minSelections ?? 1,
      candidates: group.candidates,
    })),
  };

  const lines = [
    "MODEL_SELECTION_REQUIRED",
    "Hive needs an explicit model/client choice before it can continue.",
    cause ? `Host selection failed: ${cause}` : undefined,
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "Choices:",
  ].filter((line): line is string => line !== undefined);

  for (const group of groups) {
    lines.push("", `${group.query} (choose at least ${group.minSelections ?? 1}):`);
    lines.push(...group.candidates.map(c => `- ${c}`));
  }
  return lines.join("\n");
}

function fallbackMessage(query: string, candidates: string[], cause?: string): string {
  return selectionRequiredMessage([{ query, candidates, minSelections: 1 }], cause);
}

async function askForMultipleClientGroups(groups: CandidateGroup[], extra: RequestHandlerExtra<any, any>): Promise<string[]> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [index, group] of groups.entries()) {
    const key = `clients_${index}`;
    required.push(key);
    const anyOf = await Promise.all(group.candidates.map(async client => ({
      const: client,
      title: await optionTitle(client),
    })));
    properties[key] = {
      type: "array",
      title: group.query,
      description: `Models matching "${group.query}"`,
      minItems: group.minSelections ?? 1,
      maxItems: group.candidates.length,
      items: { anyOf },
      default: group.candidates.slice(0, Math.min(group.minSelections ?? 1, group.candidates.length)),
    };
  }

  const result = await extra.sendRequest({
    method: "elicitation/create",
    params: {
      mode: "form",
      message: "Choose models for each ambiguous Hive entry.",
      requestedSchema: {
        type: "object",
        properties,
        required,
      },
    },
  } as any, ElicitResultSchema as any, { timeout: 60_000 }) as any;

  if (result.action !== "accept") {
    throw new ClientResolutionError(`Model selection was ${result.action}.`, groups.flatMap(g => g.candidates));
  }

  const selected: string[] = [];
  for (const [index, group] of groups.entries()) {
    const key = `clients_${index}`;
    const value = result.content?.[key];
    if (!Array.isArray(value) || value.length < (group.minSelections ?? 1) || value.some(c => typeof c !== "string" || !group.candidates.includes(c))) {
      throw new ClientResolutionError(`Invalid model selection for "${group.query}".`, group.candidates);
    }
    selected.push(...value);
  }

  return selected;
}

export async function resolveSingleClient(client: string | undefined, extra: RequestHandlerExtra<any, any>): Promise<string> {
  if (!client || isModelSelectionSentinel(client)) {
    const candidates = await findDefaultClientCandidates(5);
    if (candidates.length === 0) {
      throw new ClientResolutionError("No Hive clients are available.", []);
    }
    try {
      return await askForSingleClient(
        "no model specified",
        candidates,
        extra,
        "No model was specified for this Hive run. Which model should Hive use?",
      );
    } catch (err) {
      if (err instanceof ClientResolutionError) throw err;
      log("Default client elicitation failed", "WARN", { error: err instanceof Error ? err.message : String(err) });
      throw new ClientResolutionError(
        selectionRequiredMessage([{ query: "no model specified", candidates, minSelections: 1 }], err instanceof Error ? err.message : String(err)),
        candidates,
      );
    }
  }

  const exact = getClient(client);
  if (exact && client.startsWith("opencode:")) return client;

  const candidates = await findClientCandidates(client, 5);
  if (candidates.length === 0) {
    if (exact) return client;
    throw new ClientResolutionError(`Unknown client "${client}".`, []);
  }
  if (candidates.length === 1 && !exact) return candidates[0];
  if (candidates.length === 1 && exact) return client;

    try {
      return await askForSingleClient(client, candidates, extra);
    } catch (err) {
      if (err instanceof ClientResolutionError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      log("Client elicitation failed", "WARN", { query: client, error: message });
      throw new ClientResolutionError(fallbackMessage(client, candidates, message), candidates);
  }
}

export async function resolveConsensusClients(clients: string[] | undefined, extra: RequestHandlerExtra<any, any>): Promise<string[]> {
  if (!clients || clients.length === 0 || isModelSelectionRequest(clients)) {
    const candidates = await findDefaultClientCandidates(5);
    if (candidates.length < 1) {
      throw new ClientResolutionError("At least one Hive client is required, but no clients are available.", candidates);
    }
    try {
      return await askForMultipleClients(
        "no model specified",
        candidates,
        extra,
        1,
        "No models were specified for this Hive run. Which model(s) should Hive use? Choose one or more.",
      );
    } catch (err) {
      if (err instanceof ClientResolutionError) throw err;
      log("Default consensus client elicitation failed", "WARN", { error: err instanceof Error ? err.message : String(err) });
      throw new ClientResolutionError(
        selectionRequiredMessage([{ query: "no models specified", candidates, minSelections: 1 }], err instanceof Error ? err.message : String(err)),
        candidates,
      );
    }
  }

  const resolved: string[] = [];
  const ambiguous: CandidateGroup[] = [];
  for (const client of clients) {
    const exact = getClient(client);
    if (exact && client.startsWith("opencode:")) {
      resolved.push(client);
      continue;
    }

    const candidates = await findClientCandidates(client, 5);
    if (candidates.length === 0) {
      if (exact) {
        resolved.push(client);
        continue;
      }
      throw new ClientResolutionError(`Unknown client "${client}".`, []);
    }
    if (candidates.length === 1 && !exact) {
      resolved.push(candidates[0]);
      continue;
    }
    if (candidates.length === 1 && exact) {
      resolved.push(client);
      continue;
    }

    ambiguous.push({ query: client, candidates, minSelections: 1 });
  }

  if (ambiguous.length > 0) {
    try {
      resolved.push(...await askForMultipleClientGroups(ambiguous, extra));
    } catch (err) {
      if (err instanceof ClientResolutionError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      log("Consensus client elicitation failed", "WARN", { queries: ambiguous.map(g => g.query), error: message });
      throw new ClientResolutionError(selectionRequiredMessage(ambiguous, message), ambiguous.flatMap(g => g.candidates));
    }
  }

  return Array.from(new Set(resolved));
}
