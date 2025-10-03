/**
 * JSON persistence helpers for WorkspaceState (for long HITL pauses).
 */
import { ZodError, z } from "zod";
import type {
  DiffSummary,
  FileEntry,
  OpLogEntry,
  WorkspaceState,
} from "./workspace";
import { createWorkspace } from "./workspace";

const isoTimestamp = z.string().datetime({ offset: true });

const fileEntrySchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  updatedAt: isoTimestamp,
});

const diffSummarySchema: z.ZodType<DiffSummary> = z.object({
  patch: z.string(),
  addedLines: z.number().int().nonnegative(),
  removedLines: z.number().int().nonnegative(),
  beforeBytes: z.number().int().nonnegative(),
  afterBytes: z.number().int().nonnegative(),
  deltaBytes: z.number().int(),
});

const opLogEntrySchema: z.ZodType<OpLogEntry> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("write"),
    path: z.string().min(1),
    bytes: z.number().int().nonnegative(),
    ts: isoTimestamp,
    diff: diffSummarySchema,
  }),
  z.object({
    kind: z.literal("edit"),
    path: z.string().min(1),
    ts: isoTimestamp,
    diff: diffSummarySchema,
  }),
  z.object({
    kind: z.literal("todo"),
    item: z.string().min(1),
    ts: isoTimestamp,
  }),
]);

const workspaceSnapshotSchema = z.object({
  vfs: z.array(fileEntrySchema),
  ops: z.array(opLogEntrySchema),
});

type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>;

function parseWorkspaceSnapshot(json: string): WorkspaceSnapshot {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(json) as unknown;
  } catch (error) {
    throw new Error("Failed to parse workspace snapshot JSON.", { cause: error });
  }

  try {
    return workspaceSnapshotSchema.parse(parsedJson);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(
        "Workspace snapshot JSON did not match the expected schema.",
        { cause: error },
      );
    }
    throw error;
  }
}

export function serializeWorkspace(workspace: WorkspaceState): string {
  const snapshot = {
    vfs: Array.from(workspace.vfs.values()).sort((a, b) =>
      a.path.localeCompare(b.path)
    ),
    ops: workspace.ops.map((op) => ({ ...op })),
  } satisfies { vfs: FileEntry[]; ops: OpLogEntry[] };
  return JSON.stringify(snapshot);
}

export function deserializeWorkspace(json: string): WorkspaceState {
  const snapshot = parseWorkspaceSnapshot(json);
  const workspace = createWorkspace();
  workspace.vfs.clear();
  for (const entry of snapshot.vfs) {
    workspace.vfs.set(entry.path, entry);
  }
  workspace.ops.splice(0, workspace.ops.length, ...snapshot.ops);
  return workspace;
}
