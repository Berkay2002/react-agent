import type { Agent, RunResult } from "@openai/agents";
import type { WorkspaceState } from "../state/workspace";

type WorkspaceRunResult<TOutput> = RunResult<
  TOutput,
  Agent<WorkspaceState, TOutput>,
  WorkspaceState
>;

export async function handleInterruptions<TOutput>(
  result: WorkspaceRunResult<TOutput>
): Promise<WorkspaceRunResult<TOutput>> {
  let current = result;

  // TODO: Replace this stub with your approval UI/policy layer—fetch reviewer permissions, enforce path allowlists,
  //       render computed diffs, and persist approve/reject decisions before resuming execution.
  while ((current.interruptions?.length ?? 0) > 0) {
    const interruptions = current.interruptions ?? [];
    for (const interruption of interruptions) {
      const toolName = interruption.rawItem?.name ?? "";
      // TODO: Use the WorkspaceState snapshot to attach before/after hunks (diff-match-patch or unified diff);
      //       for writes include target path + byte delta, for edits include contextual lines so reviewers have clarity.
      if (
        toolName === "write_file" ||
        toolName === "edit_file" ||
        toolName === "todo_write"
      ) {
        current.state.approve(interruption);
      } else {
        current.state.reject(interruption);
      }
    }

    const nextAgent = current.lastAgent;
    if (!nextAgent) {
      break;
    }

    current = await current.runner.run(nextAgent, current.state);
  }

  return current;
}
