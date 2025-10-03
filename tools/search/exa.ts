import { tool } from "@openai/agents";
import { z } from "zod";
import { ENV } from "../../config/env";

type SearchResult = {
  url: string;
  title: string;
  snippet: string;
};

const getHostname = (value: string): string | null => {
  if (typeof URL.canParse === "function" && !URL.canParse(value)) {
    return null;
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const domainMatches = (hostname: string, domain: string): boolean => {
  if (hostname === domain) {
    return true;
  }
  return hostname.endsWith(`.${domain}`);
};

const isDomainAllowed = (hostname: string): boolean => {
  for (const deniedDomain of ENV.EXA_DENIED_DOMAINS) {
    if (domainMatches(hostname, deniedDomain)) {
      return false;
    }
  }

  if (ENV.EXA_ALLOWED_DOMAINS.length === 0) {
    return true;
  }

  for (const allowedDomain of ENV.EXA_ALLOWED_DOMAINS) {
    if (domainMatches(hostname, allowedDomain)) {
      return true;
    }
  }

  return false;
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
    // Filter results against configured allow and deny domain lists so downstream agents stay within policy.
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
      const hostname = getHostname(result.url);
      if (hostname === null || !isDomainAllowed(hostname)) {
        continue;
      }

      const snippet = result.text?.slice(0, 280) ?? "";
      items.push({ url: result.url, title: result.title, snippet });
    }

    return JSON.stringify(items);
  },
});
