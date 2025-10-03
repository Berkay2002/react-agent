/**
 * Gemini 2.5 models via Vercel AI SDK → OpenAI Agents SDK bridge.
 * Keep "thinking" responses internal; tune thinkingConfig when you benchmark deeper reasoning.
 */
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { aisdk as createAISDKModel } from "@openai/agents-extensions";

// Explicitly configure to use Google Generative AI (not Vertex AI)
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
  baseURL: "https://generativelanguage.googleapis.com/v1beta",
});

export const gemini25Pro = createAISDKModel(google("gemini-2.5-pro"));
export const gemini25Flash = createAISDKModel(google("gemini-2.5-flash"));
