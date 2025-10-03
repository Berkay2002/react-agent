import { readFileSync } from "node:fs";
import { Agent } from "@openai/agents";
import { gemini25Pro } from "../model/google";
import exa from "../tools/search/exa";
import tavily from "../tools/search/tavily";
import readFile from "../tools/vfs/read-file";
const researcherPrompt = readFileSync(new URL("../prompts/researcher.md", import.meta.url), "utf8");
export const Researcher = new Agent({
    name: "Researcher",
    instructions: researcherPrompt,
    model: gemini25Pro,
    tools: [tavily, exa, readFile],
});
