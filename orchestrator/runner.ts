import {
  type Agent,
  type AgentInputItem,
  Runner,
  type RunResult,
} from "@openai/agents";
import type { WorkspaceState } from "../state/workspace";

// TODO: When promoting to production, assign a workflowName (e.g., "research-pipeline"), enable tracing via
//       OPENAI_TRACE or your logger, and centralize any model overrides here so all entry points stay aligned.
export const runner = new Runner({});

export async function runOnce<TOutput>(
  agent: Agent<WorkspaceState, TOutput>,
  input: string | AgentInputItem[],
  context: WorkspaceState
): Promise<RunResult<TOutput, Agent<WorkspaceState, TOutput>, WorkspaceState>> {
  return runner.run(agent, input, { context, maxTurns: 10 });
}
