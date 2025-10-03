/**
 * Gemini 2.5 Pro via Vercel AI SDK provider + Agents SDK adapter.
 * Thinking output stays internal; adjust thinkingConfig when you need deeper reasoning.
 */
import { google } from "@ai-sdk/google";
import { aisdk } from "@openai/agents-extensions";

export const gemini25Pro = aisdk(
  google("gemini-2.5-pro", {
    // TODO: Run the orchestration benchmark suite and set thinkingConfig to the smallest token budget that still clears
    //       complex tasks (start trials at 2048 tokens, keep includeThoughts false, and capture latency/cost deltas for future tuning).
    // thinkingConfig: { budgetTokens: 4096, includeThoughts: false },
  })
);

// TODO: After identifying low-stakes operations (rewrite, summarize), export gemini-2.5-flash here and route those
//       tool calls to it so routine steps use the cheaper model while gemini25Pro stays reserved for reasoning-heavy turns.
// export const gemini25Flash = aisdk(google("gemini-2.5-flash"));
