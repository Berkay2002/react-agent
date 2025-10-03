import { tool } from "@openai/agents";
import { z } from "zod";
import { ENV } from "../../config/env";

type SearchResult = {
  url: string;
  title: string;
  snippet: string;
};

const exaResponseSchema = z.object({
  results: z
    .array(
      z.object({
        url: z.string().url(),
        title: z.string(),
        text: z.string().optional(),
      })
    )
    .default([]),
});

export default tool({
  name: "exa_search",
  description: "Semantic/keyword web search; returns url/title/snippet array.",
  parameters: z.object({
    query: z.string(),
    numResults: z.number().int().min(1).max(10).default(5),
    useAutoprompt: z.boolean().default(true),
  }),
  strict: true,
  execute: async ({ query, numResults, useAutoprompt }) => {
    // TODO: Load an allow/deny domain list from configuration and filter Exa responses so downstream agents never see
    //       content outside compliance and brand-safety boundaries.
    if (ENV.EXA_API_KEY.length === 0) {
      return "Exa API key not configured.";
    }

    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ENV.EXA_API_KEY,
      },
      body: JSON.stringify({
        query,
        numResults,
        useAutoprompt,
        type: "neural",
        contents: { text: true },
      }),
    });

    if (!response.ok) {
      return `Exa error ${response.status}`;
    }

    const json = (await response.json()) as unknown;
    const parsed = exaResponseSchema.safeParse(json);

    if (!parsed.success) {
      return "Exa response parsing failed.";
    }

    const items: SearchResult[] = [];
    for (const result of parsed.data.results) {
      const snippet = result.text?.slice(0, 280) ?? "";
      items.push({ url: result.url, title: result.title, snippet });
    }

    return JSON.stringify(items);
  },
});
