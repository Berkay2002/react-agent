import { type RunContext, tool } from "@openai/agents";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

export default tool({
  name: "read_file",
  description: "Read a UTF-8 file from the virtual workspace.",
  parameters: z.object({ path: z.string() }),
  strict: true,
  execute: async ({ path }, ctx?: RunContext<WorkspaceState>) => {
    if (!ctx) {
      return "Workspace context unavailable.";
    }
    const entry = ctx.context.get(path);
    return entry?.content ?? "(not found)";
  },
});
