/**
 * Shared state (RunContext<T>) carried through tools and handoffs.
 * Purely in-memory virtual filesystem with an operation log.
 */
import { Buffer } from "node:buffer";
function isoTimestamp() {
    return new Date(Date.now()).toISOString();
}
const LINE_SPLIT_REGEX = /\r?\n/;
function splitLines(text) {
    if (text.length === 0) {
        return [];
    }
    const lines = text.split(LINE_SPLIT_REGEX);
    if (lines.length > 0 && lines.at(-1) === "") {
        lines.pop();
    }
    return lines;
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: <16>
function buildDiffOperations(before, after) {
    const beforeLength = before.length;
    const afterLength = after.length;
    const table = Array.from({ length: beforeLength + 1 }, () => Array.from({ length: afterLength + 1 }, () => 0));
    for (let i = beforeLength - 1; i >= 0; i -= 1) {
        for (let j = afterLength - 1; j >= 0; j -= 1) {
            const beforeLine = before[i];
            const afterLine = after[j];
            const tableRowI = table[i];
            const tableRowIPlus1 = table[i + 1];
            if (beforeLine === afterLine && tableRowI && tableRowIPlus1) {
                const nextCell = tableRowIPlus1[j + 1];
                if (typeof nextCell === "number") {
                    tableRowI[j] = nextCell + 1;
                }
            }
            else if (tableRowI && tableRowIPlus1) {
                const cellBelow = tableRowIPlus1[j];
                const cellRight = tableRowI[j + 1];
                if (typeof cellBelow === "number" && typeof cellRight === "number") {
                    tableRowI[j] = Math.max(cellBelow, cellRight);
                }
            }
        }
    }
    const operations = [];
    let i = 0;
    let j = 0;
    let oldLine = 1;
    let newLine = 1;
    while (i < beforeLength && j < afterLength) {
        const beforeLine = before[i];
        const afterLine = after[j];
        const tableRowI = table[i];
        const tableRowIPlus1 = table[i + 1];
        if (beforeLine !== undefined && beforeLine === afterLine) {
            operations.push({
                type: "context",
                line: beforeLine,
                oldLine,
                newLine,
            });
            i += 1;
            j += 1;
            oldLine += 1;
            newLine += 1;
        }
        else if (tableRowIPlus1 &&
            tableRowI &&
            (tableRowIPlus1[j] ?? 0) >= (tableRowI[j + 1] ?? 0)) {
            operations.push({
                type: "remove",
                line: beforeLine ?? "",
                oldLine,
                newLine,
            });
            i += 1;
            oldLine += 1;
        }
        else {
            operations.push({
                type: "add",
                line: afterLine ?? "",
                oldLine,
                newLine,
            });
            j += 1;
            newLine += 1;
        }
    }
    while (i < beforeLength) {
        const beforeLine = before[i];
        operations.push({
            type: "remove",
            line: beforeLine ?? "",
            oldLine,
            newLine,
        });
        i += 1;
        oldLine += 1;
    }
    while (j < afterLength) {
        const afterLine = after[j];
        operations.push({
            type: "add",
            line: afterLine ?? "",
            oldLine,
            newLine,
        });
        j += 1;
        newLine += 1;
    }
    return operations;
}
function createUnifiedDiff(path, operations) {
    let hasChanges = false;
    const patchLines = [`--- a/${path}`, `+++ b/${path}`];
    let inHunk = false;
    let hunkLines = [];
    let oldStart = 0;
    let newStart = 0;
    let oldCount = 0;
    let newCount = 0;
    const flushHunk = () => {
        if (!inHunk) {
            return;
        }
        patchLines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
        patchLines.push(...hunkLines);
        inHunk = false;
        hunkLines = [];
        oldStart = 0;
        newStart = 0;
        oldCount = 0;
        newCount = 0;
    };
    for (const operation of operations) {
        if (operation.type === "context") {
            if (inHunk) {
                flushHunk();
            }
            continue;
        }
        hasChanges = true;
        if (!inHunk) {
            inHunk = true;
            oldStart = operation.oldLine;
            newStart = operation.newLine;
        }
        if (operation.type !== "add") {
            oldCount += 1;
        }
        if (operation.type !== "remove") {
            newCount += 1;
        }
        const marker = operation.type === "add" ? "+" : "-";
        hunkLines.push(`${marker}${operation.line}`);
    }
    flushHunk();
    if (!hasChanges) {
        return "";
    }
    return patchLines.join("\n");
}
function createDiffSummary(path, before, after) {
    const beforeLines = splitLines(before);
    const afterLines = splitLines(after);
    const operations = buildDiffOperations(beforeLines, afterLines);
    const addedLines = operations.filter((operation) => operation.type === "add").length;
    const removedLines = operations.filter((operation) => operation.type === "remove").length;
    const beforeBytes = Buffer.byteLength(before, "utf8");
    const afterBytes = Buffer.byteLength(after, "utf8");
    const deltaBytes = afterBytes - beforeBytes;
    const patch = createUnifiedDiff(path, operations);
    return {
        patch,
        addedLines,
        removedLines,
        beforeBytes,
        afterBytes,
        deltaBytes,
    };
}
export function createWorkspace() {
    const vfs = new Map();
    const ops = [];
    return {
        vfs,
        ops,
        get(path) {
            return vfs.get(path);
        },
        put(path, content) {
            const timestamp = isoTimestamp();
            const previousContent = vfs.get(path)?.content ?? "";
            const diff = createDiffSummary(path, previousContent, content);
            vfs.set(path, { path, content, updatedAt: timestamp });
            ops.push({
                kind: "write",
                path,
                bytes: Buffer.byteLength(content, "utf8"),
                ts: timestamp,
                diff,
            });
        },
        edit(path, pattern, replacement) {
            const timestamp = isoTimestamp();
            const currentContent = vfs.get(path)?.content ?? "";
            const nextContent = currentContent.replace(pattern, replacement);
            const diff = createDiffSummary(path, currentContent, nextContent);
            vfs.set(path, { path, content: nextContent, updatedAt: timestamp });
            ops.push({ kind: "edit", path, ts: timestamp, diff });
        },
        appendTodo(text) {
            const timestamp = isoTimestamp();
            const todoPath = "todo.md";
            const currentContent = vfs.get(todoPath)?.content ?? "";
            const nextContent = `${currentContent}- [ ] ${text}\n`;
            vfs.set(todoPath, {
                path: todoPath,
                content: nextContent,
                updatedAt: timestamp,
            });
            ops.push({ kind: "todo", item: text, ts: timestamp });
        },
    };
}
