# Testing Requirements

Imported into the project-level CLAUDE.md via `@./standards/testing-requirements.md`.

## What we test

Exercises in this lab are run manually via `npm run mN:slug` and verified by
inspecting stdout. The lab itself has no test framework configured — the
exercises *are* the verification.

When tests do exist for capstone code:

- **Real integrations over mocks.** Especially for tool/agent loops, prefer
  hitting a real test MCP server over mocking transports.
- **Each test must be independently runnable.** No order dependencies.
- **Name tests by behavior**, not by function: `it("rejects refunds over $500")`
  not `it("preToolUseHook returns blocked")`.
