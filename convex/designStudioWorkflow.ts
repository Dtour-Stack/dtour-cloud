import { v } from "convex/values";
import { internal } from "./_generated/api";
import { workflow } from "./workflowManager";

/** Durable Design Studio run — one step per graph node with retries. */
export const designStudioRun = workflow
  .define({
    args: {
      token: v.string(),
      runId: v.id("workflowRuns"),
      graph: v.string(),
    },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    const order = await step.runQuery(internal.workflow.topoOrder, {
      graph: args.graph,
    });
    let outputsJson = "{}";
    for (const nodeId of order) {
      const result = await step.runAction(
        internal.workflow.executeNode,
        {
          token: args.token,
          runId: args.runId,
          graph: args.graph,
          nodeId,
          outputsJson,
        },
        { retry: true },
      );
      outputsJson = result.outputsJson;
    }
    await step.runMutation(internal.workflow.finalizeRun, {
      id: args.runId,
      status: "done",
    });
    return null;
  });
