import { type RunContext, tool } from "@openai/agents";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

const promptPath = fileURLToPath(
  new URL("../../prompts/ls.md", import.meta.url)
);
const description = await readFile(promptPath, "utf8");

export default tool({
  name: "ls",
  description,
  parameters: z.object({}),
  strict: true,
  execute: (_args, ctx?: RunContext<WorkspaceState>) => {
    if (!ctx) {
      return "Workspace context unavailable.";
    }
    const files = Array.from(ctx.context.vfs.keys());
    return files.length > 0 ? files.join("\n") : "(no files in workspace)";
  },
});
