import { describe, it, expect } from "vitest";
import { cancelHiveJob, formatHiveJobCollection, formatHiveJobList, getHiveJob, startHiveJob, waitForHiveJob } from "../src/jobs/manager.js";

const summary = {
  clients: ["test"],
  role: "default",
  prompt_chars: 4,
};

describe("Hive job manager", () => {
  it("stores completed background job results", async () => {
    const job = startHiveJob("hive", summary, async () => ({
      content: [{ type: "text", text: "ok" }],
      isError: false,
    }));

    expect(await waitForHiveJob(job, 1000)).toBe(true);
    const stored = getHiveJob(job.id);
    expect(stored?.status).toBe("completed");
    expect(stored?.result?.content[0]?.text).toBe("ok");
  });

  it("cancels running background jobs", async () => {
    const job = startHiveJob("hive", summary, async (signal) => new Promise(resolve => {
      signal.addEventListener("abort", () => resolve({
        content: [{ type: "text", text: "aborted" }],
        isError: true,
      }), { once: true });
    }));

    const result = cancelHiveJob(job.id);
    expect(result.ok).toBe(true);
    expect(await waitForHiveJob(job, 1000)).toBe(true);
    expect(getHiveJob(job.id)?.status).toBe("cancelled");
  });

  it("groups related jobs by run_id for compact collection", async () => {
    const run_id = `review-${Date.now().toString(36)}`;
    const jobA = startHiveJob("hive", { ...summary, run_id, clients: ["glm"] }, async () => ({
      content: [{ type: "text", text: "glm review" }],
      isError: false,
    }));
    const jobB = startHiveJob("hive", { ...summary, run_id, clients: ["kimi"] }, async () => ({
      content: [{ type: "text", text: "kimi review" }],
      isError: false,
    }));

    expect(await waitForHiveJob(jobA, 1000)).toBe(true);
    expect(await waitForHiveJob(jobB, 1000)).toBe(true);

    const listed = formatHiveJobList(run_id);
    expect(listed).toContain(`run_id=${run_id}`);
    expect(listed).toContain("clients=glm");
    expect(listed).toContain("clients=kimi");

    const collected = JSON.parse(formatHiveJobCollection(run_id, true));
    expect(collected.run_id).toBe(run_id);
    expect(collected.summary.completed).toBe(2);
    expect(collected.completed_outputs).toHaveLength(2);
    expect(collected.completed_outputs.map((output: any) => output.text)).toEqual(expect.arrayContaining(["glm review", "kimi review"]));
  });
});
