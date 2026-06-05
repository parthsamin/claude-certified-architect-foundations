# Claude Architect Lab — Project-level CLAUDE.md

> This file is the **project-level CLAUDE.md** for this repo. If you run
> `claude` (Claude Code) in this directory, this file is auto-loaded into
> Claude's context. It is checked into version control so every contributor
> gets the same standards.
>
> The Module 5 hierarchy:
> 1. User-level: `~/.claude/CLAUDE.md` — personal preferences (not in VCS).
> 2. **Project-level: a root `CLAUDE.md` (this file)** OR `.claude/CLAUDE.md`.
> 3. Directory-level: `CLAUDE.md` inside subdirectories — applies only when
>    Claude is editing files in that directory.

## Project overview

This is the hands-on lab for the **Claude Certified Architect — Foundations**
exam. Node.js (ESM), uses `@anthropic-ai/sdk` and `@modelcontextprotocol/sdk`.

Coding standards are described in @./standards/coding-style.md
Test requirements are in @./standards/testing-requirements.md
Project structure overview is in @README.md
Dependency list is in @package.json

## Universal conventions

- Node 18+, ESM only (`"type": "module"`).
- Every exercise script must be runnable as a single command (`npm run mN:slug`).
- Heavy inline comments — the exercise files are part of the curriculum.
- Never hard-code secrets. Read from `.env` via `dotenv`.
- Lock the model string to `claude-sonnet-4-6` unless a concept calls out otherwise.

## Agent conventions (lab-specific)

- Two SDKs, kept distinct: the **Client SDK** (`@anthropic-ai/sdk`, the
  Messages API client) is what the lab hand-rolls the agent loop on; the
  real **Agent SDK** (`@anthropic-ai/claude-agent-sdk`) runs the loop for you
  and appears only in `m3:sdk` (`06-real-agent-sdk.js`). See
  `revision/agent-sdk-vs-client-sdk.md`. Don't conflate the two in prose.
- The shared `Agent` abstraction lives at `src/module-03-agent-sdk/agent.js`.
  It is the hand-rolled Client-SDK loop. All Module 3+ exercises (except
  `m3:sdk`) import from it; do not duplicate the loop logic.
- Tool definitions follow Anthropic API shape: `{ name, description, input_schema }`.
- MCP tool definitions arrive as `{ name, description, inputSchema }` — translate
  to `input_schema` at the boundary (`src/module-04-mcp/mcp-host.js`).
