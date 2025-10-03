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
const MAX_SNIPPET_LENGTH = 280;
const SCORE_WEIGHT = 0.7;
const RECENCY_WEIGHT = 0.3;
const DAYS_IN_YEAR = 365;
const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

const MIN_RESULTS = 1;
const MAX_RESULTS = 10;
const DEFAULT_RESULTS = 5;

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

  if (
    currentState === undefined ||
    now - currentState.windowStart >= THROTTLE_WINDOW_MS
  ) {
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
  const normalizedScore = typeof score === "number" ? Math.max(0, score) : 0;

  if (publishedDate === undefined) {
    return normalizedScore * SCORE_WEIGHT;
  }

  const parsedDate = new Date(publishedDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return normalizedScore * SCORE_WEIGHT;
  }

  const ageInDays = (now - parsedDate.getTime()) / MS_PER_DAY;
  const recencyScore = Math.max(
    0,
    1 - Math.min(ageInDays, DAYS_IN_YEAR) / DAYS_IN_YEAR
  );

  return normalizedScore * SCORE_WEIGHT + recencyScore * RECENCY_WEIGHT;
}

export default tool({
  name: "tavily_search",
  description:
    "High-recall web search for facts. Returns url/title/snippet array.",
  parameters: z.object({
    query: z.string(),
    max_results: z.number().int().min(MIN_RESULTS).max(MAX_RESULTS).default(DEFAULT_RESULTS),
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

    if (response.status === HTTP_UNAUTHORIZED || response.status === HTTP_FORBIDDEN) {
      return "Tavily auth or permission error.";
    }

    if (response.status === HTTP_TOO_MANY_REQUESTS) {
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
      const rightScore = deriveRankScore(
        right.score,
        right.published_date,
        now
      );
      return rightScore - leftScore;
    });

    const items: SearchResult[] = [];
    for (const result of ranked) {
      const snippet = result.content?.slice(0, MAX_SNIPPET_LENGTH) ?? "";
      items.push({ url: result.url, title: result.title, snippet });
    }

    return JSON.stringify(items);
  },
});
