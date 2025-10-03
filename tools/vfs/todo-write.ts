import { type RunContext, tool } from "@openai/agents";
import { z } from "zod";
import { TODO_WRITE_PROMPT } from "@/prompts";
import type { WorkspaceState } from "../../state/workspace";

export default tool({
  name: "todo_write",
  description: TODO_WRITE_PROMPT,
  parameters: z.object({ item: z.string() }),
  strict: true,
  execute: ({ item }, ctx?: RunContext<WorkspaceState>) => {
    if (!ctx) {
      return "Workspace context unavailable.";
    }
    ctx.context.appendTodo(item);
    return `Added todo: ${item}`;
  },
});
