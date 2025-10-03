import { type RunContext, tool } from "@openai/agents";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

const promptPath = fileURLToPath(
  new URL("../../prompts/todo-write.md", import.meta.url)
);
const description = await readFile(promptPath, "utf8");

export default tool({
  name: "todo_write",
  description,
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
