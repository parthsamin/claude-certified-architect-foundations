---
paths: ["src/module-03-agent-sdk/**/*.js"]
---

# Agent loop rules — conditionally loaded for Module-3 code

Loaded only when Claude Code is editing files in `src/module-03-agent-sdk/`.
Reinforces the patterns the Module 3 exercises rely on, so any new code
added in this directory stays consistent.

## Completion signal

The **only** reliable completion signal is `stop_reason === "end_turn"`.
Do **not**:

- Parse assistant text for "done" / "task complete".
- Treat reaching `maxIterations` as success.
- Treat the presence of any text block as completion (text co-exists with
  tool_use turns).

`maxIterations` is a safety net only — on exhaustion, **throw**.

## Hooks vs prompts

Anything with **financial, legal, or safety** consequences must be enforced
with a `PreToolUse` hook, not a system-prompt instruction. Prompts are
probabilistic (~95%); hooks are deterministic (100%).

## Subagent context

When a coordinator delegates to a subagent, **explicitly pass** all needed
context in the subagent's prompt. The subagent's `messages` array starts
empty — it cannot see the coordinator's history.

## Tool privilege

`allowedTools` is a deliberate whitelist, not a mirror of the catalog.
Discovery (via MCP or otherwise) does not equal permission.
