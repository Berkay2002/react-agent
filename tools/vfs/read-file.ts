import { type RunContext, tool } from "@openai/agents";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

const promptPath = fileURLToPath(
  new URL("../../prompts/read-file.md", import.meta.url),
);
const description = await readFile(promptPath, "utf8");

export default tool({
  name: "read_file",
  description,
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
