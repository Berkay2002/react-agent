/**
 * Rewrite utility exposed as an agent-as-tool to keep style guidance centralized.
 */
import { Agent } from "@openai/agents";
import { z } from "zod";
import { gemini25Flash } from "../../model/google";

const writerAgent = new Agent({
  name: "Writer",
  instructions:
    "You rewrite text for clarity and concision. Keep meaning and citations (e.g., [1]).\nDo not add facts. Return only the rewritten text.",
  model: gemini25Flash,
});

const rewriteTool = writerAgent.asTool({
  toolName: "rewrite_text",
  toolDescription:
    "Rewrite text to improve clarity and flow while preserving meaning.",
  outputType: z.object({
    text: z.string().min(1, "Rewritten text cannot be empty."),
    notes: z.array(z.string().min(1, "Notes must contain text.")).default([]),
    citations: z
      .array(z.string().min(1, "Citations must contain text."))
      .default([]),
  }),
});

export default rewriteTool;
