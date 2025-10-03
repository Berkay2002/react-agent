import { Agent } from "@openai/agents";
import { gemini25Flash } from "../../model/google";

const summarizerAgent = new Agent({
  name: "Summarizer",
  instructions:
    "Summarize input into concise bullet points. Preserve key facts and citations (e.g., [1]).\nIf details are missing, state assumptions explicitly.",
  model: gemini25Flash,
});

const summarizeTool = summarizerAgent.asTool({
  toolName: "summarize_text",
  toolDescription: "Summarize text into concise bullet points.",
});

export default summarizeTool;
