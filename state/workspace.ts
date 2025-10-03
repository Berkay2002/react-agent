/**
 * Shared state (RunContext<T>) carried through tools and handoffs.
 * Purely in-memory virtual filesystem with an operation log.
 */
import { Buffer } from "node:buffer";

export type FileEntry = { path: string; content: string; updatedAt: string };

export type DiffSummary = {
  patch: string;
  addedLines: number;
  removedLines: number;
  beforeBytes: number;
  afterBytes: number;
  deltaBytes: number;
};

export type WriteOp = {
  kind: "write";
  path: string;
  bytes: number;
  ts: string;
  diff: DiffSummary;
};
export type EditOp = {
  kind: "edit";
  path: string;
  ts: string;
  diff: DiffSummary;
};
export type TodoOp = { kind: "todo"; item: string; ts: string };

export type OpLogEntry = WriteOp | EditOp | TodoOp;

export type WorkspaceState = {
  vfs: Map<string, FileEntry>;
  ops: OpLogEntry[];
  get(path: string): FileEntry | undefined;
  put(path: string, content: string): void;
  edit(path: string, pattern: RegExp, replacement: string): void;
  appendTodo(text: string): void;
};

function isoTimestamp(): string {
  return new Date(Date.now()).toISOString();
}

type DiffOperation =
  | { type: "add"; line: string; oldLine: number; newLine: number }
  | { type: "remove"; line: string; oldLine: number; newLine: number }
  | { type: "context"; line: string; oldLine: number; newLine: number };

function splitLines(text: string): string[] {
  if (text.length === 0) {
    return [];
  }
  const lines = text.split(/\r?\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function buildDiffOperations(before: string[], after: string[]): DiffOperation[] {
  const beforeLength = before.length;
  const afterLength = after.length;
  const table: number[][] = Array.from({ length: beforeLength + 1 }, () =>
    Array.from({ length: afterLength + 1 }, () => 0)
  );

  for (let i = beforeLength - 1; i >= 0; i -= 1) {
    for (let j = afterLength - 1; j >= 0; j -= 1) {
      if (before[i] === after[j]) {
        table[i][j] = table[i + 1][j + 1] + 1;
      } else {
        table[i][j] = Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }
  }

  const operations: DiffOperation[] = [];
  let i = 0;
  let j = 0;
  let oldLine = 1;
  let newLine = 1;

  while (i < beforeLength && j < afterLength) {
    if (before[i] === after[j]) {
      operations.push({
        type: "context",
        line: before[i],
        oldLine,
        newLine,
      });
      i += 1;
      j += 1;
      oldLine += 1;
      newLine += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      operations.push({
        type: "remove",
        line: before[i],
        oldLine,
        newLine,
      });
      i += 1;
      oldLine += 1;
    } else {
      operations.push({
        type: "add",
        line: after[j],
        oldLine,
        newLine,
      });
      j += 1;
      newLine += 1;
    }
  }

  while (i < beforeLength) {
    operations.push({
      type: "remove",
      line: before[i],
      oldLine,
      newLine,
    });
    i += 1;
    oldLine += 1;
  }

  while (j < afterLength) {
    operations.push({
      type: "add",
      line: after[j],
      oldLine,
      newLine,
    });
    j += 1;
    newLine += 1;
  }

  return operations;
}

function createUnifiedDiff(path: string, operations: DiffOperation[]): string {
  let hasChanges = false;
  const patchLines = [`--- a/${path}`, `+++ b/${path}`];
  let inHunk = false;
  let hunkLines: string[] = [];
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

function createDiffSummary(path: string, before: string, after: string): DiffSummary {
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

export function createWorkspace(): WorkspaceState {
  const vfs = new Map<string, FileEntry>();
  const ops: OpLogEntry[] = [];

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
