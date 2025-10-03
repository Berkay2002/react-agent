import "dotenv/config";

type RequiredEnvKey = "GOOGLE_GENERATIVE_AI_API_KEY";

function requireEnv(key: RequiredEnvKey): string {
  const value = process.env[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  throw new Error(`Missing required env var: ${key}`);
}

const googleApiKey = requireEnv("GOOGLE_GENERATIVE_AI_API_KEY");

export const ENV = {
  GOOGLE_API_KEY: googleApiKey,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? "",
  EXA_API_KEY: process.env.EXA_API_KEY ?? "",
} as const;
