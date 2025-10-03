Create this scaffolding.

```
/ ReAct...
├─ src/
│  ├─ config/
│  │  └─ env.ts                  # loads env, asserts required keys (API keys, etc.)
│  ├─ model/
│  │  └─ google.ts               # wraps Gemini 2.5 Pro via AI SDK → Agents adapter
│  ├─ state/
│  │  ├─ workspace.ts            # virtual FS + op log (RunContext<T> state)
│  │  └─ persist.ts              # serialize/deserialize workspace (for long HITL pauses)
│  ├─ tools/
│  │  ├─ search/
│  │  │  ├─ tavily.ts            # tavily search tool
│  │  │  └─ exa.ts               # exa search tool
│  │  ├─ vfs/
│  │  │  ├─ read-file.ts         # read from VFS (no approval)
│  │  │  ├─ write-file.ts        # write to VFS (needsApproval: true)
│  │  │  ├─ edit-file.ts         # regex edit (needsApproval: true)
│  │  │  └─ todo-write.ts        # append todo to VFS
│  │  └─ text/
│  │     ├─ rewrite.ts           # shared text utility (agent-as-tool or function tool)
│  │     └─ summarize.ts         # ditto
│  ├─ agents/
│  │  ├─ researcher.ts           # domain specialist (ReAct; uses tavily/exa + VFS read)
│  │  └─ manager.ts              # triage/router; uses agents-as-tools + handoffs
│  ├─ orchestrator/
│  │  ├─ runner.ts               # creates/reuses Runner; central run() helper
│  │  └─ approvals.ts            # simple policy for auto-approvals / UI prompts
│  ├─ prompts/
│  │  ├─ researcher.md           # system prompt for Researcher (tools usage, style)
│  │  └─ manager.md              # system prompt for Manager (routing, safety rules)
│  ├─ app/
│  │  ├─ cli.ts                  # CLI entrypoint (prints approvals, resumes runs)
│  │  └─ next/
│  │     └─ app/api/agent/route.ts   # optional Next.js SSE endpoint (streaming)
│  └─ index.ts                   # tiny demo: boot workspace, call run(), handle HITL
├─ .env.example                  # GOOGLE_*, TAVILY_API_KEY, EXA_API_KEY, etc.
├─ package.json
├─ tsconfig.json
├─ README.md
└─ .gitignore
```

CRITICAL: do not write code for the files you create, only comment at the top of the file with the name with path is enough.
