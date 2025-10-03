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
  const result = await runOnce(
    Manager,
    "Research the latest on topic X and save a brief to notes/today.md",
    workspace
  );

  const finalResult = await handleInterruptions(
    result as Parameters<typeof handleInterruptions>[0]
  );

  writeLine("\n=== FINAL OUTPUT ===\n");
  const output = finalResult.finalOutput;
  let formattedOutput: string;
  if (typeof output === "string") {
    formattedOutput = output;
  } else if (output) {
    formattedOutput = JSON.stringify(output);
  } else {
    formattedOutput = "(no output)";
  }
  writeLine(formattedOutput);

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
