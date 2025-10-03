Here’s a complete, **state-first** scaffold with every file stubbed, strong TODOs, and best-practice notes baked in. It uses a shared **WorkspaceState** (virtual FS) in `RunContext`, **Gemini 2.5 Pro** via the **Vercel AI SDK** provider + the **OpenAI Agents SDK** adapter, **HITL** approvals for mutating tools, **handoffs** to a domain specialist (Researcher), and reusable **text utilities** as agents-as-tools.

> Notes / sources for design choices: `RunContext` shared across tools & handoffs, HITL approvals, result interruptions & resume, handoffs pattern, Gemini thinking config in the Google provider. ([OpenAI GitHub][1])

---

# Files

> Copy/paste each block into the matching path.

---

### `package.json`

```json
{
  "name": "react-gemini-agents-statefs",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/app/cli.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/app/cli.js",
    "check": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@openai/agents": "^0.3.0",
    "@openai/agents-extensions": "^0.3.0",
    "@ai-sdk/google": "^0.0.0",
    "ai": "^5.0.0",
    "zod": "^3.23.8",
    "dotenv": "^16.4.5"
  },
  "devDependencies": {
    "tsx": "^4.19.1",
    "typescript": "^5.6.3"
  }
}
```

> **TODO:** After validating a successful install, lock every dependency to the precise version exercised in CI (e.g., `@openai/agents@0.3.0`, `ai@5.0.0`, `@ai-sdk/google@0.0.0`) by rerunning `npm install --save-exact` so repro builds run against identical SDKs, and note the required AI SDK/provider major pairing for future upgrades. ([Vercel][2])

---

### `tsconfig.json`

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["node"]
  },
  "include": ["src"]
}
```

---

### `.env.example`

```bash
# Google Gemini (Vercel AI SDK provider)
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here

# Search
TAVILY_API_KEY=your_key_here
EXA_API_KEY=your_key_here
```

---

### `src/config/env.ts`

```ts
import "dotenv/config";

function requireEnv(key: string): string {
  const v = process.env[key];
  if (!v) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}

export const ENV = {
  GOOGLE_API_KEY: requireEnv("GOOGLE_GENERATIVE_AI_API_KEY"),
  TAVILY_API_KEY: process.env.TAVILY_API_KEY ?? "",
  EXA_API_KEY: process.env.EXA_API_KEY ?? "",
};
```

---

### `src/model/google.ts`

```ts
/**
 * Gemini 2.5 Pro via Vercel AI SDK provider + Agents SDK adapter.
 * You can control "thinking" behavior with thinkingConfig; keep thoughts out of user-visible text.
 * Docs: AI SDK Google provider + thinkingConfig.
 */
import { google } from "@ai-sdk/google";
import { aisdk } from "@openai/agents-extensions";

export const gemini25Pro = aisdk(
  google("gemini-2.5-pro", {
    // TODO: Run the orchestration benchmarks and set thinkingConfig to the lowest budget that still solves them
    //       (start at 2048 tokens, keep includeThoughts false, and log the latency/cost shift for future tuning).
    // thinkingConfig: { budgetTokens: 4096, includeThoughts: false },
  })
);

// TODO: After identifying low-stakes operations (rewrite, summarize), add a gemini-2.5-flash export here and route
//       those tool invocations to it so routine steps hit the cheaper model while leaving gemini25Pro for reasoning.
// export const gemini25Flash = aisdk(google('gemini-2.5-flash'));
```

> Why: the provider supports a “thinking” budget for complex ReAct loops; keep thoughts private. ([AI SDK][3])

---

### `src/state/workspace.ts`

```ts
/**
 * Shared state (RunContext<T>) carried through tools and handoffs.
 * This is a purely in-memory virtual filesystem with an operation log.
 * You can serialize it for long HITL pauses and resume later.
 *
 * Docs: RunContext shared across tools/handoffs; Results & interruptions.
 */

export type FileEntry = { path: string; content: string; updatedAt: string };

export type OpLogEntry =
  | { kind: "write"; path: string; bytes: number; ts: string }
  | { kind: "edit"; path: string; ts: string }
  | { kind: "todo"; item: string; ts: string };

export type WorkspaceState = {
  vfs: Map<string, FileEntry>;
  ops: OpLogEntry[];

  get(path: string): FileEntry | undefined;
  put(path: string, content: string): void;
  edit(path: string, re: RegExp, replacement: string): void;
  appendTodo(text: string): void;

  // Optional utilities for previews/diffs, persistence, etc.
  // TODO: Wire in a lightweight diff (diff-match-patch is fine) so approval prompts render before/after snippets,
  //       touched line counts, and byte deltas for every pending write/edit request.
};

export function createWorkspace(): WorkspaceState {
  const vfs = new Map<string, FileEntry>();
  const ops: OpLogEntry[] = [];

  return {
    vfs,
    ops,
    get: (p) => vfs.get(p),
    put: (p, c) => {
      const now = new Date().toISOString();
      vfs.set(p, { path: p, content: c, updatedAt: now });
      ops.push({
        kind: "write",
        path: p,
        bytes: Buffer.byteLength(c, "utf8"),
        ts: now,
      });
    },
    edit: (p, re, rep) => {
      const now = new Date().toISOString();
      const cur = vfs.get(p)?.content ?? "";
      const out = cur.replace(re, rep);
      vfs.set(p, { path: p, content: out, updatedAt: now });
      ops.push({ kind: "edit", path: p, ts: now });
    },
    appendTodo: (t) => {
      const now = new Date().toISOString();
      const p = "todo.md";
      const cur = vfs.get(p)?.content ?? "";
      const out = cur + `- [ ] ${t}\n`;
      vfs.set(p, { path: p, content: out, updatedAt: now });
      ops.push({ kind: "todo", item: t, ts: now });
    },
  };
}
```

> Why: `RunContext<T>` is the right place for persistent, shared state across tools & handoffs. ([OpenAI GitHub][1])

---

### `src/state/persist.ts`

```ts
/**
 * Simple JSON persistence for WorkspaceState.
 * Use when you need to store state across long human-in-the-loop pauses.
 * Docs: human-in-the-loop guide shows approve/reject + resume with RunState serialization.
 */
import type { WorkspaceState, FileEntry, OpLogEntry } from "./workspace";

export function serializeWorkspace(ws: WorkspaceState): string {
  const obj = {
    vfs: Array.from(ws.vfs.values()),
    ops: ws.ops,
  };
  return JSON.stringify(obj);
}

export function deserializeWorkspace(json: string): WorkspaceState {
  const data = JSON.parse(json) as { vfs: FileEntry[]; ops: OpLogEntry[] };
  const vfs = new Map<string, FileEntry>(data.vfs.map((e) => [e.path, e]));
  const ops = data.ops ?? [];
  return {
    vfs,
    ops,
    get: (p) => vfs.get(p),
    put: (p, c) => {
      const now = new Date().toISOString();
      vfs.set(p, { path: p, content: c, updatedAt: now });
      ops.push({
        kind: "write",
        path: p,
        bytes: Buffer.byteLength(c, "utf8"),
        ts: now,
      });
    },
    edit: (p, re, rep) => {
      const now = new Date().toISOString();
      const cur = vfs.get(p)?.content ?? "";
      const out = cur.replace(re, rep);
      vfs.set(p, { path: p, content: out, updatedAt: now });
      ops.push({ kind: "edit", path: p, ts: now });
    },
    appendTodo: (t) => {
      const now = new Date().toISOString();
      const p = "todo.md";
      const cur = vfs.get(p)?.content ?? "";
      const out = cur + `- [ ] ${t}\n`;
      vfs.set(p, { path: p, content: out, updatedAt: now });
      ops.push({ kind: "todo", item: t, ts: now });
    },
  };
}
```

> Why: HITL runs can be paused; serialize `result.state` and your own workspace state to resume later. ([OpenAI GitHub][4])

---

### `src/tools/search/tavily.ts`

```ts
import { tool } from "@openai/agents";
import { z } from "zod";
import { ENV } from "../../config/env";

/**
 * Tavily search tool (compact, citation-friendly output).
 * TODO: Add an error handler that buckets auth/permission, rate-limit, and network failures, apply per-tenant call
 *       throttles to stay inside Tavily quotas, and re-rank the snippets by recency plus score before returning JSON.
 */
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
    const r = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ENV.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({ query, max_results }),
    });
    if (!r.ok) return `Tavily error ${r.status}`;
    const data = await r.json();
    const items = (data?.results ?? []).map((x: any) => ({
      url: x.url,
      title: x.title,
      snippet: typeof x.content === "string" ? x.content.slice(0, 280) : "",
    }));
    return JSON.stringify(items);
  },
});
```

---

### `src/tools/search/exa.ts`

```ts
import { tool } from "@openai/agents";
import { z } from "zod";
import { ENV } from "../../config/env";

/**
 * Exa semantic/keyword search with content extraction.
 * TODO: Load an allow/deny domain list from config and filter Exa responses so results honor compliance and brand
 *       safety policies before the agent sees them.
 */
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
    const r = await fetch("https://api.exa.ai/search", {
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
    if (!r.ok) return `Exa error ${r.status}`;
    const data = await r.json();
    const items = (data?.results ?? []).map((x: any) => ({
      url: x.url,
      title: x.title,
      snippet: typeof x.text === "string" ? x.text.slice(0, 280) : "",
    }));
    return JSON.stringify(items);
  },
});
```

---

### `src/tools/vfs/read-file.ts`

```ts
import { tool, RunContext } from "@openai/agents";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

export default tool({
  name: "read_file",
  description: "Read a UTF-8 file from the virtual workspace.",
  parameters: z.object({ path: z.string() }),
  strict: true,
  execute: async ({ path }, ctx?: RunContext<WorkspaceState>) => {
    return ctx?.context.get(path)?.content ?? "(not found)";
  },
});
```

---

### `src/tools/vfs/write-file.ts`

```ts
import { tool, RunContext } from "@openai/agents";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

/**
 * HITL-gated write. The SDK will interrupt and wait for approval.
 * Docs: needsApproval → interruptions → approve/reject → resume.
 */
export default tool({
  name: "write_file",
  description: "Write UTF-8 text to a virtual file.",
  parameters: z.object({ path: z.string(), content: z.string() }),
  needsApproval: true,
  strict: true,
  execute: async ({ path, content }, ctx?: RunContext<WorkspaceState>) => {
    ctx?.context.put(path, content);
    return `Wrote ${path} (${content.length} chars)`;
  },
});
```

---

### `src/tools/vfs/edit-file.ts`

```ts
import { tool, RunContext } from "@openai/agents";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

export default tool({
  name: "edit_file",
  description: "Regex find/replace on a virtual file.",
  parameters: z.object({
    path: z.string(),
    find: z.string(),
    replace: z.string(),
    flags: z.string().default("g"),
  }),
  needsApproval: true,
  strict: true,
  execute: async (
    { path, find, replace, flags },
    ctx?: RunContext<WorkspaceState>
  ) => {
    ctx?.context.edit(path, new RegExp(find, flags), replace);
    return `Edited ${path}`;
  },
});
```

---

### `src/tools/vfs/todo-write.ts`

```ts
import { tool, RunContext } from "@openai/agents";
import { z } from "zod";
import type { WorkspaceState } from "../../state/workspace";

export default tool({
  name: "todo_write",
  description: "Append a task to todo.md in the virtual workspace.",
  parameters: z.object({ item: z.string() }),
  strict: true,
  execute: async ({ item }, ctx?: RunContext<WorkspaceState>) => {
    ctx?.context.appendTodo(item);
    return `Added todo: ${item}`;
  },
});
```

---

### `src/tools/text/rewrite.ts`

```ts
/**
 * Rewrite utility exposed as an agent-as-tool, so you can control style centrally.
 * Rationale: keep "generic text ops" reusable without creating new conversation owners.
 */
import { Agent } from "@openai/agents";
import { gemini25Pro } from "../../model/google";

const writerAgent = new Agent({
  name: "Writer",
  instructions: `
You rewrite text for clarity and concision. Keep meaning and citations (e.g., [1]).
Do not add facts. Return only the rewritten text.
`,
  model: gemini25Pro,
});

const rewriteTool = writerAgent.asTool({
  toolName: "rewrite_text",
  toolDescription:
    "Rewrite text to improve clarity and flow while preserving meaning.",
  // TODO: Once consumers demand structured rewrites, define an outputType z.object (e.g., { text, notes, citations })
  //       so malformed responses throw immediately and can be retried or surfaced to HITL.
});

export default rewriteTool;
```

---

### `src/tools/text/summarize.ts`

```ts
import { Agent } from "@openai/agents";
import { gemini25Pro } from "../../model/google";

const summarizerAgent = new Agent({
  name: "Summarizer",
  instructions: `
Summarize input into concise bullet points. Preserve key facts and citations (e.g., [1]).
If details are missing, state assumptions explicitly.
`,
  model: gemini25Pro,
});

const summarizeTool = summarizerAgent.asTool({
  toolName: "summarize_text",
  toolDescription: "Summarize text into concise bullet points.",
});

export default summarizeTool;
```

---

### `src/agents/researcher.ts`

```ts
import { Agent } from "@openai/agents";
import { gemini25Pro } from "../model/google";
import tavily from "../tools/search/tavily";
import exa from "../tools/search/exa";
import readFile from "../tools/vfs/read-file";

/**
 * ReAct-style research specialist.
 * Best practice: keep prompts explicit about when to use tools; cite sources from tool outputs.
 */
export const Researcher = new Agent({
  name: "Researcher",
  instructions: `
You are a research specialist. Use search tools to gather facts.
Workflow: think → search → read → synthesize. Prefer primary sources.
Return a concise answer with [n]-style citations mapping to the tool outputs' URLs.
Never fabricate citations.
`,
  model: gemini25Pro,
  tools: [tavily, exa, readFile],
  // TODO: For compliance-sensitive workflows, set toolChoice = 'required' so every run invokes search before
  //       drafting an answer, ensuring citations always reflect fresh tool output.
});
```

---

### `src/agents/manager.ts`

```ts
import { Agent } from "@openai/agents";
import { gemini25Pro } from "../model/google";
import { Researcher } from "./researcher";
import rewriteTool from "../tools/text/rewrite";
import summarizeTool from "../tools/text/summarize";
import writeFile from "../tools/vfs/write-file";
import editFile from "../tools/vfs/edit-file";
import todoWrite from "../tools/vfs/todo-write";

/**
 * Triage/Manager that routes and composes.
 * - Hands off to Researcher for research-heavy tasks.
 * - Uses text utilities as tools for quick polishing.
 * - Mutations (write/edit) are HITL-gated by the tools themselves.
 */
export const Manager = new Agent({
  name: "Manager",
  instructions: `
You route and compose. If the task requires external facts or citations, hand off to Researcher.
Use rewrite/summarize tools for text quality. For file mutations, rely on write/edit tools.
Produce a clean final answer unless explicitly asked to write to the workspace.
`,
  model: gemini25Pro,
  tools: [rewriteTool, summarizeTool, writeFile, editFile, todoWrite],
  handoffs: [Researcher],
});
```

> Why: handoffs are tools the LLM can call; control remains with the specialist until it finishes. ([OpenAI GitHub][5])

---

### `src/orchestrator/runner.ts`

```ts
import { Runner, Agent, AgentInputItem, RunResult } from "@openai/agents";
import type { WorkspaceState } from "../state/workspace";

/**
 * A reusable Runner instance for your app.
 * Add global model overrides, tracing, and guardrails here if needed.
 */
export const runner = new Runner({
  // TODO: When wiring into production, assign a workflowName (e.g., 'research-pipeline'), enable tracing via
  //       OPENAI_TRACE or your logger, and centralize any model overrides here so all entry points stay in sync.
  // workflowName: 'research-pipeline',
});

export async function runOnce<TOut>(
  agent: Agent<WorkspaceState, TOut>,
  input: string | AgentInputItem[],
  ctx: WorkspaceState
): Promise<RunResult<TOut, Agent<WorkspaceState, TOut>, WorkspaceState>> {
  return runner.run(agent, input, { context: ctx, maxTurns: 10 });
}
```

---

### `src/orchestrator/approvals.ts`

```ts
import { RunResult } from "@openai/agents";
import type { WorkspaceState } from "../state/workspace";

/**
 * Default approval policy.
 * TODO: Integrate your approval UI/policy layer here—fetch reviewer permissions, enforce path allowlists, render
 *       the computed diffs, and persist approve/reject decisions before resuming the run.
 */
export async function handleInterruptions(
  res: RunResult<any, any, WorkspaceState>
): Promise<RunResult<any, any, WorkspaceState>> {
  let current = res;

  while (current.interruptions?.length) {
    for (const intr of current.interruptions) {
      const t = intr.rawItem;

      // TODO: Use the WorkspaceState snapshot to build before/after hunks (diff-match-patch or unified diff) and
      //       attach them to the approval payload; for writes show target path + byte delta, for edits show context.

      // Approve writes/edits by default for demo; swap with real UI prompt.
      if (
        t.name === "write_file" ||
        t.name === "edit_file" ||
        t.name === "todo_write"
      ) {
        current.state.approve(intr);
      } else {
        current.state.reject(intr);
      }
    }

    // Resume from current state
    current = await current.runner.run(current.lastAgent!, current.state);
  }

  return current;
}
```

> Why: HITL flow = interruptions → approve/reject → resume with `RunState`. ([OpenAI GitHub][4])

---

### `src/prompts/researcher.md`

```md
You are a research specialist.

- Think → Act (search tools) → Observe → Revise plan → Answer.
- Use `tavily_search` and `exa_search` to gather facts before answering.
- Prefer primary sources and official docs.
- Output: short paragraphs or bullets; include [n]-style citations mapping to tool result URLs.
- Never invent citations; if uncertain, say so and request permission to search more.
```

---

### `src/prompts/manager.md`

```md
You are the orchestrator.

- If external facts or citations are needed → hand off to Researcher.
- Use rewrite/summarize tools to polish drafts.
- For file mutations, call the appropriate tool and rely on approval flow.
- Keep answers short and clear unless asked for a longer report.
```

---

### `src/app/cli.ts`

```ts
/**
 * Simple CLI to demo one-turn orchestration + HITL approvals.
 * Usage: npm run dev
 */
import { Manager } from "../agents/manager";
import { createWorkspace } from "../state/workspace";
import { runOnce } from "../orchestrator/runner";
import { handleInterruptions } from "../orchestrator/approvals";

async function main() {
  const ws = createWorkspace();

  let res = await runOnce(
    Manager,
    "Research the latest on topic X and save a brief to notes/today.md",
    ws
  );

  // HITL loop (auto-approves by default; replace with a real UI/prompt)
  res = await handleInterruptions(res);

  console.log("\n=== FINAL OUTPUT ===\n");
  console.log(res.finalOutput ?? "(no output)");

  // Example: inspect workspace
  console.log("\n=== VFS ===");
  for (const [p, e] of ws.vfs.entries()) {
    console.log("-", p, `(${e.content.length} chars)`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

### `src/app/next/app/api/agent/route.ts` (optional Next.js)

```ts
/**
 * Minimal Next.js route (app router) to run a single turn.
 * TODO: Replace the single Response with StreamedRunResult.toTextStream(), wrap it in a ReadableStream/SSE, and
 *       update the client handler to render incremental tokens for a live progress UI.
 * NOTE: Keep API keys on the server.
 */
import { NextRequest } from "next/server";
import { Manager } from "../../../../agents/manager";
import { createWorkspace } from "../../../../state/workspace";
import { runner } from "../../../../orchestrator/runner";

export const runtime = "nodejs"; // or 'edge' if compatible

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();
  const ws = createWorkspace();

  const result = await runner.run(Manager, prompt ?? "Say hello", {
    context: ws,
  });

  // TODO: Expose a follow-up endpoint (e.g., POST /api/agent/interruptions) that accepts approval decisions,
  //       calls result.state.approve/reject with the stored RunState, and resumes the run so HITL works over HTTP.
  return new Response(
    JSON.stringify({
      finalOutput: result.finalOutput,
      vfsPaths: Array.from(ws.vfs.keys()),
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}
```

> For streaming UX (SSE/Web Streams), use `run(..., { stream: true })` and pipe `toTextStream()`. ([OpenAI GitHub][6])

---

### `src/index.ts`

```ts
export * from "./agents/manager";
export * from "./agents/researcher";
export * from "./model/google";
export * from "./state/workspace";
export * from "./orchestrator/runner";
```

---

# Final setup checklist

1. `npm i` → `npm run dev`.
2. Replace the dummy prompt in `cli.ts` and watch the HITL flow approve writes.
3. Swap `handleInterruptions` with a UI and real policy (diff previews, allowlists).
4. Add evals (golden prompts + assertions) once behavior stabilizes.

[1]: https://openai.github.io/openai-agents-js/guides/context/?utm_source=chatgpt.com "Context management | OpenAI Agents SDK - GitHub Pages"
[2]: https://vercel.com/docs/ai-sdk?utm_source=chatgpt.com "AI SDK"
[3]: https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai?utm_source=chatgpt.com "Google Generative AI provider"
[4]: https://openai.github.io/openai-agents-js/guides/human-in-the-loop/?utm_source=chatgpt.com "Human in the loop | OpenAI Agents SDK - GitHub Pages"
[5]: https://openai.github.io/openai-agents-js/guides/handoffs/?utm_source=chatgpt.com "Handoffs | OpenAI Agents SDK - GitHub Pages"
[6]: https://openai.github.io/openai-agents-js/guides/results/?utm_source=chatgpt.com "Results | OpenAI Agents SDK - GitHub Pages"
