import { tool } from "@openai/agents";
import { z } from "zod";
import { ENV } from "../../config/env";

type SearchResult = {
  url: string;
  title: string;
  snippet: string;
};

const tavilyResponseSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string(),
        content: z.string().optional(),
      })
    )
    .default([]),
});

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
    // TODO: Add failure bucketing for auth/permission, rate-limit, and network errors; apply per-tenant throttles to
    //       stay within Tavily quotas; and re-rank snippets by recency plus API score before returning the JSON payload.
    if (ENV.TAVILY_API_KEY.length === 0) {
      return "Tavily API key not configured.";
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ query, max_results }),
    });

    if (!response.ok) {
      return `Tavily error ${response.status}`;
    }

    const json = (await response.json()) as unknown;
    const parsed = tavilyResponseSchema.safeParse(json);

    if (!parsed.success) {
      return "Tavily response parsing failed.";
    }

    const items: SearchResult[] = [];
    for (const result of parsed.data.results) {
      const snippet = result.content?.slice(0, 280) ?? "";
      items.push({ url: result.url, title: result.title, snippet });
    }

    return JSON.stringify(items);
  },
});
