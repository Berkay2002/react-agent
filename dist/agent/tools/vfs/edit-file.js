import { tool } from "@openai/agents";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { z } from "zod";
const promptPath = fileURLToPath(new URL("../../prompts/edit-file.md", import.meta.url));
const description = await readFile(promptPath, "utf8");
export default tool({
    name: "edit_file",
    description,
    parameters: z.object({
        path: z.string(),
        find: z.string(),
        replace: z.string(),
        flags: z.string().default("g"),
    }),
    needsApproval: true,
    strict: true,
    execute: ({ path, find, replace, flags }, ctx) => {
        if (!ctx) {
            return "Workspace context unavailable.";
        }
        let regex;
        try {
            regex = new RegExp(find, flags);
        }
        catch (error) {
            return error instanceof Error
                ? error.message
                : "Invalid regular expression.";
        }
        ctx.context.edit(path, regex, replace);
        return `Edited ${path}`;
    },
});
