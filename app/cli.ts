import { Manager } from "../agents/manager";
import { handleInterruptions } from "../orchestrator/approvals";
import { runOnce } from "../orchestrator/runner";
import { createWorkspace } from "../state/workspace";

function writeLine(text: string): void {
  process.stdout.write(`${text}\n`);
}

function writeError(text: string): void {
  process.stderr.write(`${text}\n`);
}

async function main(): Promise<void> {
  const workspace = createWorkspace();
  let result = await runOnce(
    Manager,
    "Research the latest on topic X and save a brief to notes/today.md",
    workspace
  );

  result = await handleInterruptions(result);

  writeLine("\n=== FINAL OUTPUT ===\n");
  writeLine(result.finalOutput ?? "(no output)");

  writeLine("\n=== VFS ===");
  for (const [path, entry] of workspace.vfs.entries()) {
    writeLine(`- ${path} (${entry.content.length} chars)`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected error";
  writeError(message);
  process.exitCode = 1;
});
