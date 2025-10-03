import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Agent, RunResult, RunToolApprovalItem } from "@openai/agents";
import type { WorkspaceState } from "../state/workspace";

type WorkspaceRunResult<TOutput> = RunResult<
  TOutput,
  Agent<WorkspaceState, TOutput>,
  WorkspaceState
>;

type ReviewerProfile = {
  id: string;
  name: string;
  allow: string[];
  deny: string[];
  logPath: string;
};

type ApprovalDecision = {
  approve: boolean;
  always: boolean;
  reason: string;
};

type InterruptionAnalysis = {
  toolName: string;
  callId?: string;
  path?: string;
  diff?: string;
  byteDelta?: number;
  summary: string;
  metadata: Record<string, unknown>;
};

type DecisionRecord = {
  reviewerId: string;
  reviewerName: string;
  approved: boolean;
  always: boolean;
  reason: string;
  timestamp: string;
  toolName: string;
  callId?: string;
  path?: string;
  byteDelta?: number;
  diffPreview?: string;
  metadata: Record<string, unknown>;
};

export async function handleInterruptions<TOutput>(
  result: WorkspaceRunResult<TOutput>
): Promise<WorkspaceRunResult<TOutput>> {
  const reviewerProfile = await loadReviewerProfile();
  let current = result;

  while ((current.interruptions?.length ?? 0) > 0) {
    const workspace = extractWorkspace(current.state);
    const interruptions = current.interruptions ?? [];

    for (const interruption of interruptions) {
      const analysis = analyzeInterruption(interruption, workspace);
      renderInterruption(analysis, reviewerProfile);
      const decision = evaluateDecision(analysis, reviewerProfile);

      await persistDecision(
        {
          reviewerId: reviewerProfile.id,
          reviewerName: reviewerProfile.name,
          approved: decision.approve,
          always: decision.always,
          reason: decision.reason,
          timestamp: new Date().toISOString(),
          toolName: analysis.toolName,
          callId: analysis.callId,
          path: analysis.path,
          byteDelta: analysis.byteDelta,
          diffPreview: analysis.diff,
          metadata: analysis.metadata,
        },
        reviewerProfile.logPath
      );

      if (decision.approve) {
        current.state.approve(interruption, {
          alwaysApprove: decision.always,
        });
      } else {
        current.state.reject(interruption, {
          alwaysReject: decision.always,
        });
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

async function loadReviewerProfile(): Promise<ReviewerProfile> {
  const defaultId = process.env.AGENT_APPROVER_ID?.trim();
  const defaultName = process.env.AGENT_APPROVER_NAME?.trim();
  const baseProfile: ReviewerProfile = {
    id: defaultId && defaultId.length > 0 ? defaultId : "local-reviewer",
    name: defaultName && defaultName.length > 0 ? defaultName : "Local Reviewer",
    allow: ["**"],
    deny: [],
    logPath: process.env.AGENT_APPROVAL_LOG?.trim()?.length
      ? (process.env.AGENT_APPROVAL_LOG as string)
      : ".agent-approvals.jsonl",
  };

  const configPath = process.env.AGENT_APPROVAL_CONFIG?.trim();
  if (configPath) {
    try {
      const raw = await fsp.readFile(configPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<ReviewerProfile> & {
        allow?: unknown;
        deny?: unknown;
        logPath?: unknown;
      };
      return {
        id: typeof parsed.id === "string" && parsed.id.trim().length > 0
          ? parsed.id.trim()
          : baseProfile.id,
        name:
          typeof parsed.name === "string" && parsed.name.trim().length > 0
            ? parsed.name.trim()
            : baseProfile.name,
        allow: normalizePatternList(parsed.allow, baseProfile.allow),
        deny: normalizePatternList(parsed.deny, baseProfile.deny),
        logPath:
          typeof parsed.logPath === "string" && parsed.logPath.trim().length > 0
            ? parsed.logPath.trim()
            : baseProfile.logPath,
      };
    } catch (error) {
      process.stderr.write(
        `Failed to read approval config at ${configPath}: ${(error as Error).message}\n`
      );
    }
  }

  return {
    ...baseProfile,
    allow: parsePatternList(process.env.AGENT_APPROVAL_ALLOW, baseProfile.allow),
    deny: parsePatternList(process.env.AGENT_APPROVAL_DENY, baseProfile.deny),
  };
}

function normalizePatternList(
  source: unknown,
  fallback: string[]
): string[] {
  if (Array.isArray(source)) {
    const values = source
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter((value) => value.length > 0);
    return values.length > 0 ? values : fallback;
  }
  if (typeof source === "string") {
    return parsePatternList(source, fallback);
  }
  return fallback;
}

function parsePatternList(value: string | undefined, fallback: string[]): string[] {
  if (!value) {
    return fallback;
  }
  const segments = value
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  return segments.length > 0 ? segments : fallback;
}

function extractWorkspace(state: WorkspaceRunResult<unknown>["state"]):
  | WorkspaceState
  | undefined {
  const contextContainer = (state as unknown as {
    _context?: { context?: WorkspaceState };
  })._context;
  return contextContainer?.context;
}

function analyzeInterruption(
  interruption: RunToolApprovalItem,
  workspace?: WorkspaceState
): InterruptionAnalysis {
  const toolName = interruption.rawItem?.name ?? "";
  const callId =
    interruption.rawItem && "callId" in interruption.rawItem
      ? (interruption.rawItem.callId as string)
      : undefined;
  const rawArguments =
    interruption.rawItem && "arguments" in interruption.rawItem
      ? interruption.rawItem.arguments
      : undefined;

  let parsedArguments: Record<string, unknown> = {};
  let parseError: string | undefined;
  if (typeof rawArguments === "string" && rawArguments.length > 0) {
    try {
      parsedArguments = JSON.parse(rawArguments) as Record<string, unknown>;
    } catch (error) {
      parseError = (error as Error).message;
    }
  }

  const metadata: Record<string, unknown> = {
    arguments: parsedArguments,
  };
  if (parseError) {
    metadata.parseError = parseError;
  }

  let path: string | undefined;
  let diff: string | undefined;
  let byteDelta: number | undefined;
  let summary = `Approval requested for tool "${toolName}".`;

  if (toolName === "edit_file") {
    path = typeof parsedArguments.path === "string" ? parsedArguments.path : undefined;
    const findPattern =
      typeof parsedArguments.find === "string" ? parsedArguments.find : "";
    const flags =
      typeof parsedArguments.flags === "string" && parsedArguments.flags.length > 0
        ? parsedArguments.flags
        : "g";
    const replacement =
      typeof parsedArguments.replace === "string"
        ? parsedArguments.replace
        : "";
    const currentContent = path ? workspace?.get(path)?.content ?? "" : "";

    let nextContent = currentContent;
    try {
      const regex = new RegExp(findPattern, flags);
      const globalRegex = regex.global
        ? regex
        : new RegExp(regex.source, `${regex.flags}g`);
      metadata.matchCount = [...currentContent.matchAll(globalRegex)].length;
      nextContent = currentContent.replace(regex, replacement);
    } catch (error) {
      metadata.regexError = (error as Error).message;
    }

    byteDelta =
      Buffer.byteLength(nextContent, "utf8") -
      Buffer.byteLength(currentContent, "utf8");
    diff = path ? createUnifiedDiff(currentContent, nextContent, path) : undefined;
    summary = path
      ? `edit_file → ${path} (${formatDelta(byteDelta)})`
      : "edit_file → (missing path)";
    metadata.pattern = findPattern;
    metadata.flags = flags;
  } else if (toolName === "todo_write") {
    const item =
      typeof parsedArguments.item === "string" ? parsedArguments.item : undefined;
    summary = item
      ? `todo_write → ${item}`
      : "todo_write → (no todo item provided)";
    path = "todo.md";
  }

  return {
    toolName,
    callId,
    path,
    diff,
    byteDelta,
    summary,
    metadata,
  };
}

function evaluateDecision(
  analysis: InterruptionAnalysis,
  profile: ReviewerProfile
): ApprovalDecision {
  if (analysis.toolName === "todo_write") {
    return {
      approve: true,
      always: false,
      reason: "todo_write operations are auto-approved by policy.",
    };
  }

  if (!analysis.path) {
    return {
      approve: false,
      always: false,
      reason: "Tool call missing target path.",
    };
  }

  if (matchesAnyPattern(analysis.path, profile.deny)) {
    return {
      approve: false,
      always: true,
      reason: `Path ${analysis.path} is denied for reviewer ${profile.name}.`,
    };
  }

  if (!matchesAnyPattern(analysis.path, profile.allow)) {
    return {
      approve: false,
      always: false,
      reason: `Path ${analysis.path} is outside the allowlist for reviewer ${profile.name}.`,
    };
  }

  return {
    approve: true,
    always: false,
    reason: `Path ${analysis.path} is approved for reviewer ${profile.name}.`,
  };
}

async function persistDecision(
  record: DecisionRecord,
  logPath: string
): Promise<void> {
  const maxDiffLength = 8192;
  const entry: DecisionRecord = {
    ...record,
    diffPreview:
      record.diffPreview && record.diffPreview.length > maxDiffLength
        ? `${record.diffPreview.slice(0, maxDiffLength)}…`
        : record.diffPreview,
  };

  const directory = dirname(logPath);
  if (directory && directory !== ".") {
    await fsp.mkdir(directory, { recursive: true });
  }
  await fsp.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}

function renderInterruption(
  analysis: InterruptionAnalysis,
  profile: ReviewerProfile
): void {
  const lines: string[] = [];
  lines.push("\n=== Tool approval required ===");
  lines.push(`Reviewer: ${profile.name} (${profile.id})`);
  lines.push(`Tool: ${analysis.toolName}`);
  if (analysis.callId) {
    lines.push(`Call ID: ${analysis.callId}`);
  }
  if (analysis.path) {
    lines.push(`Target: ${analysis.path}`);
  }
  lines.push(`Summary: ${analysis.summary}`);
  if (typeof analysis.byteDelta === "number") {
    lines.push(`Byte delta: ${formatDelta(analysis.byteDelta)}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);

  if (analysis.diff) {
    process.stdout.write("--- Proposed diff ---\n");
    process.stdout.write(`${analysis.diff}\n`);
  }
}

function matchesAnyPattern(path: string, patterns: string[]): boolean {
  if (patterns.length === 0) {
    return false;
  }
  return patterns.some((pattern) => matchesPattern(path, pattern));
}

function matchesPattern(path: string, pattern: string): boolean {
  if (pattern === "**" || pattern === "*") {
    return true;
  }

  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);

  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return (
      normalizedPath === prefix ||
      normalizedPath.startsWith(prefix.length > 0 ? `${prefix}/` : "")
    );
  }

  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -2);
    if (!normalizedPath.startsWith(prefix.length > 0 ? `${prefix}/` : "")) {
      return false;
    }
    const remainder = normalizedPath.slice(prefix.length > 0 ? prefix.length + 1 : 0);
    return !remainder.includes("/");
  }

  if (normalizedPattern.endsWith("*")) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalizedPath.startsWith(prefix);
  }

  return normalizedPath === normalizedPattern;
}

function normalizePath(value: string): string {
  return value.replace(/^[./\\]+/, "").replace(/\\/g, "/");
}

function formatDelta(delta?: number): string {
  if (typeof delta !== "number" || Number.isNaN(delta)) {
    return "0";
  }
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta}`;
}

function createUnifiedDiff(before: string, after: string, path: string): string {
  if (before === after) {
    return "(no changes)";
  }

  const prefix = join(tmpdir(), "approval-");
  let directory: string | undefined;
  try {
    directory = mkdtempSync(prefix);
    const beforePath = join(directory, "before.txt");
    const afterPath = join(directory, "after.txt");
    writeFileSync(beforePath, before, "utf8");
    writeFileSync(afterPath, after, "utf8");
    const result = spawnSync("diff", ["-u", beforePath, afterPath], {
      encoding: "utf8",
    });
    if (result.error) {
      throw result.error;
    }
    const output = result.stdout?.trim() ?? "";
    if (output.length === 0) {
      return "(no changes)";
    }
    const adjusted = output
      .replaceAll(beforePath, `${path} (before)`)
      .replaceAll(afterPath, `${path} (after)`);
    return adjusted;
  } catch (error) {
    return `Diff unavailable: ${(error as Error).message}`;
  } finally {
    if (directory) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch (cleanupError) {
        process.stderr.write(
          `Failed to clean up temporary diff directory: ${(cleanupError as Error).message}\n`
        );
      }
    }
  }
}
