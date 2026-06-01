import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

/** Shared WorkflowManager — agent chat turns + Design Studio runs. */
export const workflow = new WorkflowManager(components.workflow);
