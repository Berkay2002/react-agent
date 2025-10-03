/** biome-ignore-all lint/complexity/noExcessiveCognitiveComplexity: <> */
/** biome-ignore-all lint/style/noMagicNumbers: <> */
/** biome-ignore-all lint/performance/useTopLevelRegex: <> */
/** biome-ignore-all lint/correctness/noUnusedVariables: <> */
import { spawnSync } from "node:child_process";
import { promises as fsp, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runner } from "./runner";
export async function handleInterruptions(result) {
    const reviewerProfile = await loadReviewerProfile();
    let current = result;
    while ((current.interruptions?.length ?? 0) > 0) {
        const workspace = extractWorkspace(current.state);
        const interruptions = current.interruptions ?? [];
        for (const interruption of interruptions) {
            const analysis = analyzeInterruption(interruption, workspace);
            renderInterruption(analysis, reviewerProfile);
            const decision = evaluateDecision(analysis, reviewerProfile);
            await persistDecision({
                reviewerId: reviewerProfile.id,
                reviewerName: reviewerProfile.name,
                approved: decision.approve,
                always: decision.always,
                reason: decision.reason,
                timestamp: new Date().toISOString(),
                toolName: analysis.toolName,
                ...(analysis.callId !== undefined && { callId: analysis.callId }),
                ...(analysis.path !== undefined && { path: analysis.path }),
                ...(analysis.byteDelta !== undefined && {
                    byteDelta: analysis.byteDelta,
                }),
                ...(analysis.diff !== undefined && { diffPreview: analysis.diff }),
                metadata: analysis.metadata,
            }, reviewerProfile.logPath);
            if (decision.approve) {
                current.state.approve(interruption, {
                    alwaysApprove: decision.always,
                });
            }
            else {
                current.state.reject(interruption, {
                    alwaysReject: decision.always,
                });
            }
        }
        // Resume execution with the same agent and updated state
        const nextAgent = current.lastAgent;
        if (!nextAgent) {
            break;
        }
        // Per HITL docs: pass the state back to runner.run() to continue execution
        current = await runner.run(nextAgent, current.state);
    }
    return current;
}
async function loadReviewerProfile() {
    const defaultId = process.env.AGENT_APPROVER_ID?.trim();
    const defaultName = process.env.AGENT_APPROVER_NAME?.trim();
    const baseProfile = {
        id: defaultId && defaultId.length > 0 ? defaultId : "local-reviewer",
        name: defaultName && defaultName.length > 0 ? defaultName : "Local Reviewer",
        allow: ["**"],
        deny: [],
        logPath: process.env.AGENT_APPROVAL_LOG?.trim()?.length
            ? process.env.AGENT_APPROVAL_LOG
            : ".agent-approvals.jsonl",
    };
    const configPath = process.env.AGENT_APPROVAL_CONFIG?.trim();
    if (configPath) {
        try {
            const raw = await fsp.readFile(configPath, "utf8");
            const parsed = JSON.parse(raw);
            return {
                id: typeof parsed.id === "string" && parsed.id.trim().length > 0
                    ? parsed.id.trim()
                    : baseProfile.id,
                name: typeof parsed.name === "string" && parsed.name.trim().length > 0
                    ? parsed.name.trim()
                    : baseProfile.name,
                allow: normalizePatternList(parsed.allow, baseProfile.allow),
                deny: normalizePatternList(parsed.deny, baseProfile.deny),
                logPath: typeof parsed.logPath === "string" && parsed.logPath.trim().length > 0
                    ? parsed.logPath.trim()
                    : baseProfile.logPath,
            };
        }
        catch (error) {
            process.stderr.write(`Failed to read approval config at ${configPath}: ${error.message}\n`);
        }
    }
    return {
        ...baseProfile,
        allow: parsePatternList(process.env.AGENT_APPROVAL_ALLOW, baseProfile.allow),
        deny: parsePatternList(process.env.AGENT_APPROVAL_DENY, baseProfile.deny),
    };
}
function normalizePatternList(source, fallback) {
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
function parsePatternList(value, fallback) {
    if (!value) {
        return fallback;
    }
    const segments = value
        .split(",")
        .map((segment) => segment.trim())
        .filter((segment) => segment.length > 0);
    return segments.length > 0 ? segments : fallback;
}
function extractWorkspace(state) {
    const contextContainer = state._context;
    return contextContainer?.context;
}
function analyzeInterruption(interruption, workspace) {
    const toolName = interruption.rawItem?.name ?? "";
    const callId = interruption.rawItem && "callId" in interruption.rawItem
        ? interruption.rawItem.callId
        : undefined;
    const rawArguments = interruption.rawItem && "arguments" in interruption.rawItem
        ? interruption.rawItem.arguments
        : undefined;
    let parsedArguments = {};
    let parseError;
    if (typeof rawArguments === "string" && rawArguments.length > 0) {
        try {
            parsedArguments = JSON.parse(rawArguments);
        }
        catch (error) {
            parseError = error.message;
        }
    }
    const metadata = {
        arguments: parsedArguments,
    };
    if (parseError) {
        metadata.parseError = parseError;
    }
    let path;
    let diff;
    let byteDelta;
    let summary = `Approval requested for tool "${toolName}".`;
    if (toolName === "edit_file") {
        path =
            typeof parsedArguments.path === "string"
                ? parsedArguments.path
                : undefined;
        const findPattern = typeof parsedArguments.find === "string" ? parsedArguments.find : "";
        const flags = typeof parsedArguments.flags === "string" &&
            parsedArguments.flags.length > 0
            ? parsedArguments.flags
            : "g";
        const replacement = typeof parsedArguments.replace === "string"
            ? parsedArguments.replace
            : "";
        const currentContent = path ? (workspace?.get(path)?.content ?? "") : "";
        let nextContent = currentContent;
        try {
            const regex = new RegExp(findPattern, flags);
            const globalRegex = regex.global
                ? regex
                : new RegExp(regex.source, `${regex.flags}g`);
            metadata.matchCount = [...currentContent.matchAll(globalRegex)].length;
            nextContent = currentContent.replace(regex, replacement);
        }
        catch (error) {
            metadata.regexError = error.message;
        }
        byteDelta =
            Buffer.byteLength(nextContent, "utf8") -
                Buffer.byteLength(currentContent, "utf8");
        diff = path
            ? createUnifiedDiff(currentContent, nextContent, path)
            : undefined;
        summary = path
            ? `edit_file → ${path} (${formatDelta(byteDelta)})`
            : "edit_file → (missing path)";
        metadata.pattern = findPattern;
        metadata.flags = flags;
    }
    else if (toolName === "todo_write") {
        const item = typeof parsedArguments.item === "string"
            ? parsedArguments.item
            : undefined;
        summary = item
            ? `todo_write → ${item}`
            : "todo_write → (no todo item provided)";
        path = "todo.md";
    }
    const result = {
        toolName,
        summary,
        metadata,
    };
    if (callId !== undefined) {
        result.callId = callId;
    }
    if (path !== undefined) {
        result.path = path;
    }
    if (diff !== undefined) {
        result.diff = diff;
    }
    if (byteDelta !== undefined) {
        result.byteDelta = byteDelta;
    }
    return result;
}
function evaluateDecision(analysis, profile) {
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
async function persistDecision(record, logPath) {
    const maxDiffLength = 8192;
    const entry = {
        ...record,
    };
    if (record.diffPreview !== undefined) {
        entry.diffPreview =
            record.diffPreview.length > maxDiffLength
                ? `${record.diffPreview.slice(0, maxDiffLength)}…`
                : record.diffPreview;
    }
    const directory = dirname(logPath);
    if (directory && directory !== ".") {
        await fsp.mkdir(directory, { recursive: true });
    }
    await fsp.appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf8");
}
function renderInterruption(analysis, profile) {
    const lines = [];
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
function matchesAnyPattern(path, patterns) {
    if (patterns.length === 0) {
        return false;
    }
    return patterns.some((pattern) => matchesPattern(path, pattern));
}
function matchesPattern(path, pattern) {
    if (pattern === "**" || pattern === "*") {
        return true;
    }
    const normalizedPath = normalizePath(path);
    const normalizedPattern = normalizePath(pattern);
    if (normalizedPattern.endsWith("/**")) {
        const prefix = normalizedPattern.slice(0, -3);
        return (normalizedPath === prefix ||
            normalizedPath.startsWith(prefix.length > 0 ? `${prefix}/` : ""));
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
function normalizePath(value) {
    return value.replace(/^[./\\]+/, "").replace(/\\/g, "/");
}
function formatDelta(delta) {
    if (typeof delta !== "number" || Number.isNaN(delta)) {
        return "0";
    }
    const sign = delta >= 0 ? "+" : "";
    return `${sign}${delta}`;
}
function createUnifiedDiff(before, after, path) {
    if (before === after) {
        return "(no changes)";
    }
    const prefix = join(tmpdir(), "approval-");
    let directory;
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
    }
    catch (error) {
        return `Diff unavailable: ${error.message}`;
    }
    finally {
        if (directory) {
            try {
                rmSync(directory, { recursive: true, force: true });
            }
            catch (cleanupError) {
                process.stderr.write(`Failed to clean up temporary diff directory: ${cleanupError.message}\n`);
            }
        }
    }
}
