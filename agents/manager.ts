import { readFileSync } from "node:fs";
import { Agent } from "@openai/agents";
import { gemini25Pro } from "../model/google";
import rewriteTool from "../tools/text/rewrite";
import summarizeTool from "../tools/text/summarize";
import editFile from "../tools/vfs/edit-file";
import todoWrite from "../tools/vfs/todo-write";
import writeFile from "../tools/vfs/write-file";
import { Researcher } from "./researcher";

const managerPrompt = readFileSync(
  new URL("../prompts/manager.md", import.meta.url),
  "utf8"
);

export const Manager = new Agent({
  name: "Manager",
  instructions: managerPrompt,
  model: gemini25Pro,
  tools: [rewriteTool, summarizeTool, writeFile, editFile, todoWrite],
  handoffs: [Researcher],
});
