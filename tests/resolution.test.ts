import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAllClients } from "../src/config/registry.js";
import { MODEL_SELECTION_SENTINEL, findDefaultClientCandidates, resolveConsensusClients, resolveSingleClient } from "../src/resolution/clients.js";

describe("client resolution", () => {
  beforeEach(() => {
    loadAllClients(false, false);
  });

  it("offers ranked default candidates when no single client is specified", async () => {
    const candidates = await findDefaultClientCandidates(5);
    const extra = {
      sendRequest: vi.fn(async () => ({
        action: "accept",
        content: { client: candidates[0] },
      })),
    } as any;

    const selected = await resolveSingleClient(undefined, extra);

    expect(selected).toBe(candidates[0]);
    expect(extra.sendRequest).toHaveBeenCalledOnce();
    const request = extra.sendRequest.mock.calls[0][0];
    expect(request.params.message).toContain("No model was specified");
    expect(request.params.requestedSchema.properties.client.oneOf).toHaveLength(candidates.length);
  });

  it("allows one or more selections when no hive clients are specified", async () => {
    const candidates = await findDefaultClientCandidates(5);
    const selection = candidates.slice(0, 1);
    const extra = {
      sendRequest: vi.fn(async () => ({
        action: "accept",
        content: { clients: selection },
      })),
    } as any;

    const selected = await resolveConsensusClients(undefined, extra);

    expect(selected).toEqual(selection);
    expect(extra.sendRequest).toHaveBeenCalledOnce();
    const request = extra.sendRequest.mock.calls[0][0];
    expect(request.params.message).toContain("No models were specified");
    expect(request.params.requestedSchema.properties.clients.minItems).toBe(1);
  });

  it("treats sentinel clients as an explicit request to choose hive models", async () => {
    const candidates = await findDefaultClientCandidates(5);
    const selection = candidates.slice(0, 1);
    const extra = {
      sendRequest: vi.fn(async () => ({
        action: "accept",
        content: { clients: selection },
      })),
    } as any;

    const selected = await resolveConsensusClients([MODEL_SELECTION_SENTINEL], extra);

    expect(selected).toEqual(selection);
    expect(extra.sendRequest).toHaveBeenCalledOnce();
    const request = extra.sendRequest.mock.calls[0][0];
    expect(request.params.message).toContain("No models were specified");
  });

  it("treats split select/models clients as a compatibility model-selection request", async () => {
    const candidates = await findDefaultClientCandidates(5);
    const selection = candidates.slice(0, 2);
    const extra = {
      sendRequest: vi.fn(async () => ({
        action: "accept",
        content: { clients: selection },
      })),
    } as any;

    const selected = await resolveConsensusClients(["select", "models"], extra);

    expect(selected).toEqual(selection);
    expect(extra.sendRequest).toHaveBeenCalledOnce();
  });

  it("treats single-client sentinel as an explicit request to choose one model", async () => {
    const candidates = await findDefaultClientCandidates(5);
    const extra = {
      sendRequest: vi.fn(async () => ({
        action: "accept",
        content: { client: candidates[0] },
      })),
    } as any;

    const selected = await resolveSingleClient(MODEL_SELECTION_SENTINEL, extra);

    expect(selected).toBe(candidates[0]);
    expect(extra.sendRequest).toHaveBeenCalledOnce();
  });

  it("returns a structured selection-required fallback when host elicitation is unavailable", async () => {
    const extra = {
      sendRequest: vi.fn(async () => {
        throw new Error("MCP error -32601: Method not found");
      }),
    } as any;

    await expect(resolveConsensusClients(undefined, extra)).rejects.toMatchObject({
      message: expect.stringContaining("MODEL_SELECTION_REQUIRED"),
    });

    try {
      await resolveConsensusClients(undefined, extra);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain('"type": "model_selection_required"');
      expect(message).toContain('"minSelections": 1');
      expect(message).toContain("MCP error -32601: Method not found");
      expect(message).toContain("Ask the user to choose exact client names");
    }
  });
});
