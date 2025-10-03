# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a ReAct-style agent system built with OpenAI Agents SDK, Vercel AI SDK (Google Gemini), and Next.js. The project has **two separate build targets**:

1. **Next.js Web App** (`app/next/`) - Frontend with API routes
2. **CLI Agent** (`app/cli.ts`) - Standalone command-line agent runner

## Commands

### Agent Development (CLI)
```bash
# Run the CLI agent in development (uses tsx)
npm run agent:dev

# Build the agent TypeScript → dist/agent/
npm run agent:build

# Run the built agent
npm run agent:start

# Type-check agent code without emitting files
npm run agent:check
```

### Next.js Web App
```bash
# Start Next.js dev server
npm run dev

# Build Next.js for production
npm run build

# Start Next.js production server
npm run start
```

### Code Quality
```bash
# Format and auto-fix with Ultracite (wraps Biome)
npm run format

# Lint and check for issues
npm run lint

# Or use Ultracite directly
npx ultracite fix
npx ultracite check
```

## Architecture

### Agent System Design

The codebase follows a **multi-agent handoff architecture**:

- **Manager Agent** ([agents/manager.ts](agents/manager.ts))
  - Orchestrates tasks and delegates to specialists
  - Tools: `write_file`, `edit_file`, `todo_write`, `rewrite`, `summarize`
  - Can hand off to Researcher

- **Researcher Agent** ([agents/researcher.ts](agents/researcher.ts))
  - Performs web searches and gathers information
  - Tools: `tavily` (search), `exa` (search), `read_file`
  - Returns findings to Manager

### Core Systems

**WorkspaceState** ([state/workspace.ts](state/workspace.ts))
- In-memory virtual filesystem (`vfs: Map<string, FileEntry>`)
- Tracks all file operations with unified diffs and byte deltas
- Three operation types: `WriteOp`, `EditOp`, `TodoOp`
- Methods: `get(path)`, `put(path, content)`, `edit(path, pattern, replacement)`, `appendTodo(text)`

**Runner** ([orchestrator/runner.ts](orchestrator/runner.ts))
- Wraps OpenAI Agents SDK `Runner` with workspace context
- Configurable via environment variables:
  - `OPENAI_WORKFLOW_NAME` / `WORKFLOW_NAME` (default: "react-agent-dev")
  - `AGENT_RUNNER_MODEL` / `OPENAI_DEFAULT_MODEL`
  - `OPENAI_TRACE` / `AGENT_TRACE_ENABLED`
  - `OPENAI_TRACE_INCLUDE_SENSITIVE_DATA`
- `runOnce(agent, input, context)` executes up to 10 turns

**Approval System** ([orchestrator/approvals.ts](orchestrator/approvals.ts))
- All file operations (`write_file`, `edit_file`) require approval
- Policy-based auto-approval using allow/deny patterns
- Generates unified diffs using system `diff` command
- Logs decisions to `.agent-approvals.jsonl` (configurable)
- Configuration via env vars:
  - `AGENT_APPROVER_ID`, `AGENT_APPROVER_NAME`
  - `AGENT_APPROVAL_ALLOW` (comma-separated patterns, default: `**`)
  - `AGENT_APPROVAL_DENY` (comma-separated patterns)
  - `AGENT_APPROVAL_LOG` (log file path)
  - `AGENT_APPROVAL_CONFIG` (JSON config file)

### Model Configuration

**Google Gemini Integration** ([model/google.ts](model/google.ts))
- Uses `@ai-sdk/google` + `@openai/agents-extensions` bridge
- Two models available:
  - `gemini25Pro` - More capable, used by default
  - `gemini25Flash` - Faster alternative
- Requires `GOOGLE_GENERATIVE_AI_API_KEY` in `.env`

### TypeScript Configuration

The project uses **two separate tsconfig files**:

- **tsconfig.json** - Next.js web app (includes React, DOM types)
- **tsconfig.agent.json** - CLI agent build
  - Extends base tsconfig
  - Output: `dist/agent/`
  - Includes: `config/`, `model/`, `state/`, `tools/`, `agents/`, `orchestrator/`, `app/cli.ts`
  - Stricter: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`

**Always use the correct config when building**:
- `npm run build` → Next.js
- `npm run agent:build` → CLI agent

### Tool Architecture

Tools follow OpenAI Agents SDK conventions:
- Defined with `tool({ name, description, parameters, execute })` from `@openai/agents`
- Use Zod schemas for parameters
- Receive `RunContext<WorkspaceState>` to access VFS
- File mutation tools set `needsApproval: true`

**Tool Categories**:
- **VFS Tools** (`tools/vfs/`): `write_file`, `edit_file`, `read_file`, `todo_write`
- **Search Tools** (`tools/search/`): `tavily`, `exa` (with domain filtering)
- **Text Tools** (`tools/text/`): `rewrite`, `summarize`

### Project Structure

```
├── app/
│   ├── cli.ts              # CLI entry point
│   └── next/               # Next.js app (layout, page, API routes)
├── agents/                 # Agent definitions
├── config/                 # Environment variable parsing
├── model/                  # AI model configurations
├── orchestrator/           # Runner and approval logic
├── state/                  # WorkspaceState and persistence
├── tools/                  # Agent tools (vfs, search, text)
├── prompts/                # Agent system prompts (.md files)
├── tsconfig.json           # Next.js TypeScript config
├── tsconfig.agent.json     # Agent TypeScript config
└── biome.json              # Linter/formatter config (extends ultracite)
```

## Environment Variables

Required:
- `GOOGLE_GENERATIVE_AI_API_KEY` - Google Gemini API key

Optional:
- `TAVILY_API_KEY` - Tavily search API
- `EXA_API_KEY` - Exa search API
- `EXA_ALLOWED_DOMAINS` - Comma-separated domain allowlist
- `EXA_DENIED_DOMAINS` - Comma-separated domain denylist
- Agent runner/approval env vars (see Runner and Approval System sections)

## Development Notes

- **Ultracite** is configured via [biome.json](biome.json) - it enforces strict type safety, accessibility, and code quality rules (see [.claude/CLAUDE.md](.claude/CLAUDE.md) for complete ruleset)
- Use `npm run format` before committing (enforced via husky + lint-staged)
- Agent prompts are loaded from `prompts/*.md` at runtime using `import.meta.url`
- The VFS (virtual filesystem) is purely in-memory - no actual files are written during agent execution
- All file operations are logged with diffs in `WorkspaceState.ops[]`
- When building fails with unusual errors, check if `npm run dev` is already running (Next.js port conflict)
