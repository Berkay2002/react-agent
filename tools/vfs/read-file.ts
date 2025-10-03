import { type RunContext, tool } from "@openai/agents";
import { z } from "zod";
import { READ_FILE_PROMPT } from "../../prompts/index";
import type { WorkspaceState } from "../../state/workspace";

export default tool({
  name: "read_file",
  description: READ_FILE_PROMPT,
  parameters: z.object({ path: z.string() }),
  strict: true,
  execute: ({ path }, ctx?: RunContext<WorkspaceState>) => {
    if (!ctx) {
      return "Workspace context unavailable.";
    }
    const entry = ctx.context.get(path);
    return entry?.content ?? "(not found)";
  },
});
