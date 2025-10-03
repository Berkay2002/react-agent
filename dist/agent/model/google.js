/**
 * Gemini 2.5 models via Vercel AI SDK → OpenAI Agents SDK bridge.
 * Keep "thinking" responses internal; tune thinkingConfig when you benchmark deeper reasoning.
 */
import { google } from "@ai-sdk/google";
import { aisdk as createAISDKModel } from "@openai/agents-extensions";
export const gemini25Pro = createAISDKModel(google("gemini-2.5-pro"));
export const gemini25Flash = createAISDKModel(google("gemini-2.5-flash"));
