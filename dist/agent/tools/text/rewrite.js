/**
 * Rewrite utility exposed as an agent-as-tool to keep style guidance centralized.
 */
import { Agent } from "@openai/agents";
import { gemini25Flash } from "../../model/google";
const writerAgent = new Agent({
    name: "Writer",
    instructions: "You rewrite text for clarity and concision. Keep meaning and citations (e.g., [1]).\nDo not add facts. Return only the rewritten text.",
    model: gemini25Flash,
});
const rewriteTool = writerAgent.asTool({
    toolName: "rewrite_text",
    toolDescription: "Rewrite text to improve clarity and flow while preserving meaning.",
});
export default rewriteTool;
