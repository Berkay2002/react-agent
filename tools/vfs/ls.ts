import { type RunContext, tool } from "@openai/agents";
import { z } from "zod";
import { LS_PROMPT } from "@/prompts";
import type { WorkspaceState } from "../../state/workspace";

export default tool({
  name: "ls",
  description: LS_PROMPT,
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
