/**
 * JSON persistence helpers for WorkspaceState (for long HITL pauses).
 */
import { z } from "zod";
import type { FileEntry, OpLogEntry, WorkspaceState } from "./workspace";
import { createWorkspace } from "./workspace";

const fileEntrySchema = z.object({
  path: z.string(),
  content: z.string(),
  updatedAt: z.string(),
});

const opLogEntrySchema: z.ZodType<OpLogEntry> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("write"),
    path: z.string(),
    bytes: z.number(),
    ts: z.string(),
  }),
  z.object({ kind: z.literal("edit"), path: z.string(), ts: z.string() }),
  z.object({ kind: z.literal("todo"), item: z.string(), ts: z.string() }),
]);

const workspaceSnapshotSchema = z.object({
  vfs: z.array(fileEntrySchema),
  ops: z.array(opLogEntrySchema),
});

export function serializeWorkspace(workspace: WorkspaceState): string {
  const snapshot = {
    vfs: Array.from(workspace.vfs.values()),
    ops: workspace.ops,
  } satisfies { vfs: FileEntry[]; ops: OpLogEntry[] };
  return JSON.stringify(snapshot);
}

export function deserializeWorkspace(json: string): WorkspaceState {
  const parsedJson = JSON.parse(json) as unknown;
  const snapshot = workspaceSnapshotSchema.parse(parsedJson);
  const workspace = createWorkspace();
  workspace.vfs.clear();
  for (const entry of snapshot.vfs) {
    workspace.vfs.set(entry.path, entry);
  }
  workspace.ops.splice(0, workspace.ops.length, ...snapshot.ops);
  return workspace;
}
