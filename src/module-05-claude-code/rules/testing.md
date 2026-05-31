---
paths: ["**/*.test.js", "**/*.test.ts", "**/__tests__/**"]
---

# Testing rules — conditionally loaded for test files

These rules load **only** when Claude Code is editing a test file. They
don't sit in the main context the rest of the time.

## Test structure

- Use `describe` / `it` blocks. Top-level `describe` names the unit under
  test; `it` names the *behavior* being verified.
- Each test must be independently runnable — no shared state between tests,
  no order dependencies.
- Use data factories for fixtures. Don't hard-code values that obscure intent.

## Mocks

- **Integration tests must hit a real backend** (real MCP server, real DB
  test instance). Do not mock transports — mocked tests pass while
  production breaks.
- Unit tests may mock pure dependencies only when the dependency is
  expensive or non-deterministic (clocks, randomness).

## Assertions

- Prefer one logical assertion per test. Multiple assertions are fine when
  they verify the same behavior; not when they smuggle multiple test cases
  into one block.
