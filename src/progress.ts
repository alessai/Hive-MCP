import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ProgressCallback } from "./types.js";

export function createProgressCallback(extra: RequestHandlerExtra<any, any>): ProgressCallback {
  const token = extra._meta?.progressToken;
  if (token === undefined) return async () => {};

  return async (message: string, progress: number, total: number) => {
    await extra.sendNotification({
      method: "notifications/progress",
      params: { progressToken: token, progress, total, message },
    });
  };
}
