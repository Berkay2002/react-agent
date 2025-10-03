import { Agent } from "@openai/agents";
import { RESEARCHER_PROMPT } from "@/prompts";
import { gemini25Pro } from "../model/google";
import exa from "../tools/search/exa";
import tavily from "../tools/search/tavily";
import readFile from "../tools/vfs/read-file";

export const Researcher = new Agent({
  name: "Researcher",
  instructions: RESEARCHER_PROMPT,
  model: gemini25Pro,
  tools: [tavily, exa, readFile],
});
