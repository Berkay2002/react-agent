import { tool } from "@openai/agents";
import { z } from "zod";
import { ENV } from "../../config/env";

type SearchResult = {
  url: string;
  title: string;
  snippet: string;
};

type ThrottleState = {
  count: number;
  windowStart: number;
};

const THROTTLE_WINDOW_MS = 60_000;
const THROTTLE_MAX_REQUESTS = 45;

const tavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string(),
        content: z.string().optional(),
        published_date: z.string().optional(),
        score: z.number().optional(),
      })
    )
    .default([]),
});

const throttleState = new Map<string, ThrottleState>();

function isThrottled(tenantKey: string): boolean {
  const now = Date.now();
  const currentState = throttleState.get(tenantKey);

  if (currentState === undefined || now - currentState.windowStart >= THROTTLE_WINDOW_MS) {
    throttleState.set(tenantKey, { count: 1, windowStart: now });
    return false;
  }

  if (currentState.count >= THROTTLE_MAX_REQUESTS) {
    return true;
  }

  currentState.count += 1;
  return false;
}

function deriveRankScore(
  score: number | undefined,
  publishedDate: string | undefined,
  now: number
): number {
  const scoreWeight = 0.7;
  const recencyWeight = 0.3;
  const normalizedScore = typeof score === "number" ? Math.max(0, score) : 0;

  if (publishedDate === undefined) {
    return normalizedScore * scoreWeight;
  }

  const parsedDate = new Date(publishedDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return normalizedScore * scoreWeight;
  }

  const ageInDays = (now - parsedDate.getTime()) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - Math.min(ageInDays, 365) / 365);

  return normalizedScore * scoreWeight + recencyScore * recencyWeight;
}

export default tool({
  name: "tavily_search",
  description:
    "High-recall web search for facts. Returns url/title/snippet array.",
  parameters: z.object({
    query: z.string(),
    max_results: z.number().int().min(1).max(10).default(5),
  }),
  strict: true,
  execute: async ({ query, max_results }) => {
    if (ENV.TAVILY_API_KEY.length === 0) {
      return "Tavily API key not configured.";
    }

    if (isThrottled(ENV.TAVILY_API_KEY)) {
      return "Tavily quota exceeded for this tenant. Please try again later.";
    }

    let response: Response;
    try {
      response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ENV.TAVILY_API_KEY}`,
        },
        body: JSON.stringify({ query, max_results }),
      });
    } catch {
      return "Tavily network error.";
    }

    if (response.status === 401 || response.status === 403) {
      return "Tavily auth or permission error.";
    }

    if (response.status === 429) {
      return "Tavily rate-limit error.";
    }

    if (!response.ok) {
      return `Tavily error ${response.status}`;
    }

    const json = (await response.json()) as unknown;
    const parsed = tavilyResponseSchema.safeParse(json);

    if (!parsed.success) {
      return "Tavily response parsing failed.";
    }

    const now = Date.now();
    const ranked = [...parsed.data.results].sort((left, right) => {
      const leftScore = deriveRankScore(left.score, left.published_date, now);
      const rightScore = deriveRankScore(right.score, right.published_date, now);
      return rightScore - leftScore;
    });

    const items: SearchResult[] = [];
    for (const result of ranked) {
      const snippet = result.content?.slice(0, 280) ?? "";
      items.push({ url: result.url, title: result.title, snippet });
    }

    return JSON.stringify(items);
  },
});
