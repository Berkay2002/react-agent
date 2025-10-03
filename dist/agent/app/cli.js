import { Manager } from "../agents/manager";
import { handleInterruptions } from "../orchestrator/approvals";
import { runOnce } from "../orchestrator/runner";
import { createWorkspace } from "../state/workspace";
function writeLine(text) {
    process.stdout.write(`${text}\n`);
}
function writeError(text) {
    process.stderr.write(`${text}\n`);
}
async function main() {
    const workspace = createWorkspace();
    const result = await runOnce(Manager, "Research the latest on topic X and save a brief to notes/today.md", workspace);
    const finalResult = await handleInterruptions(result);
    writeLine("\n=== FINAL OUTPUT ===\n");
    const output = finalResult.finalOutput;
    writeLine(typeof output === "string" ? output : output ? JSON.stringify(output) : "(no output)");
    writeLine("\n=== VFS ===");
    for (const [path, entry] of workspace.vfs.entries()) {
        writeLine(`- ${path} (${entry.content.length} chars)`);
    }
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unexpected error";
    writeError(message);
    process.exitCode = 1;
});
