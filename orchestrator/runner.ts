/** biome-ignore-all lint/nursery/noUselessUndefined: <> */
/** biome-ignore-all lint/suspicious/useAwait: <> */
import {
  type Agent,
  type AgentInputItem,
  type AgentOutputType,
  OPENAI_DEFAULT_MODEL_ENV_VARIABLE_NAME,
  Runner,
  type RunResult,
} from "@openai/agents";
import type { WorkspaceState } from "../state/workspace";

const WORKFLOW_ENV_KEYS = [
  "OPENAI_WORKFLOW_NAME",
  "OPENAI_WORKFLOW",
  "AGENT_WORKFLOW_NAME",
  "WORKFLOW_NAME",
] as const;

const MODEL_ENV_KEYS = [
  "AGENT_RUNNER_MODEL",
  OPENAI_DEFAULT_MODEL_ENV_VARIABLE_NAME,
] as const;

const TRACE_FLAG_ENV_KEYS = ["OPENAI_TRACE", "AGENT_TRACE_ENABLED"] as const;

const TRACE_SENSITIVE_ENV_KEYS = [
  "OPENAI_TRACE_INCLUDE_SENSITIVE_DATA",
  "AGENT_TRACE_INCLUDE_SENSITIVE_DATA",
] as const;

const DEFAULT_WORKFLOW_NAME = "react-agent-dev";

const truthyPattern = /^(1|true|yes|on)$/i;

const selectFirstEnvValue = (keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return undefined;
};

const parseBooleanEnv = (
  keys: readonly string[],
  fallback: boolean
): boolean => {
  const value = selectFirstEnvValue(keys);
  if (typeof value === "undefined") {
    return fallback;
  }
  return truthyPattern.test(value);
};

const workflowName =
  selectFirstEnvValue(WORKFLOW_ENV_KEYS) ?? DEFAULT_WORKFLOW_NAME;
const modelOverride = selectFirstEnvValue(MODEL_ENV_KEYS);
const tracingEnabled = parseBooleanEnv(TRACE_FLAG_ENV_KEYS, false);
const includeSensitiveTraceData = parseBooleanEnv(
  TRACE_SENSITIVE_ENV_KEYS,
  false
);

export const runner = new Runner({
  workflowName,
  tracingDisabled: !tracingEnabled,
  traceIncludeSensitiveData: includeSensitiveTraceData,
  ...(modelOverride ? { model: modelOverride } : {}),
});

export async function runOnce<
  TAgent extends Agent<WorkspaceState, AgentOutputType>,
>(
  agent: TAgent,
  input: string | AgentInputItem[],
  context: WorkspaceState
): Promise<RunResult<WorkspaceState, TAgent>> {
  return runner.run(agent, input, { context, maxTurns: 10 });
}
