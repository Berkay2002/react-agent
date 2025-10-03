import { type RunContext, tool } from "@openai/agents";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

export default tool({
  name: "edit_file",
  description: "Regex find/replace on a virtual file.",
  parameters: z.object({
    path: z.string(),
    find: z.string(),
    replace: z.string(),
    flags: z.string().default("g"),
  }),
  needsApproval: true,
  strict: true,
  execute: async (
    { path, find, replace, flags },
    ctx?: RunContext<WorkspaceState>
  ) => {
    if (!ctx) {
      return "Workspace context unavailable.";
    }
    let regex: RegExp;
    try {
      regex = new RegExp(find, flags);
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Invalid regular expression.";
    }
    ctx.context.edit(path, regex, replace);
    return `Edited ${path}`;
  },
});
