/**
 * Shared state (RunContext<T>) carried through tools and handoffs.
 * Purely in-memory virtual filesystem with an operation log.
 */
import { Buffer } from "node:buffer";

export type FileEntry = { path: string; content: string; updatedAt: string };

export type WriteOp = {
  kind: "write";
  path: string;
  bytes: number;
  ts: string;
};
export type EditOp = { kind: "edit"; path: string; ts: string };
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

// TODO: Wire in a lightweight diff (diff-match-patch or a unified diff helper) so approval prompts can display
//       before/after snippets, touched line counts, and byte deltas for each pending write or edit operation.

function isoTimestamp(): string {
  return new Date(Date.now()).toISOString();
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
      vfs.set(path, { path, content, updatedAt: timestamp });
      ops.push({
        kind: "write",
        path,
        bytes: Buffer.byteLength(content, "utf8"),
        ts: timestamp,
      });
    },
    edit(path, pattern, replacement) {
      const timestamp = isoTimestamp();
      const currentContent = vfs.get(path)?.content ?? "";
      const nextContent = currentContent.replace(pattern, replacement);
      vfs.set(path, { path, content: nextContent, updatedAt: timestamp });
      ops.push({ kind: "edit", path, ts: timestamp });
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
