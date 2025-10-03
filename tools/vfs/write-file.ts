import { type RunContext, tool } from "@openai/agents";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

export default tool({
  name: "write_file",
  description: "Write UTF-8 text to a virtual file.",
  parameters: z.object({ path: z.string(), content: z.string() }),
  needsApproval: true,
  strict: true,
  execute: async ({ path, content }, ctx?: RunContext<WorkspaceState>) => {
    if (!ctx) {
      return "Workspace context unavailable.";
    }
    ctx.context.put(path, content);
    return `Wrote ${path} (${content.length} chars)`;
  },
});
