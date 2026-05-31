---
context: fork
allowed-tools: ["Read", "Write", "Grep", "Glob"]
argument-hint: "Path to the source file you want tests for"
---

# /test-gen — generate tests for a source file

Real path: `.claude/skills/test-gen/SKILL.md`. Invoked by `/test-gen <path>`.

Note the difference from `/code-audit` — this skill **needs `Write`** because
its job is to create a new test file. Compare frontmatter:

|  | /code-audit | /test-gen |
|---|---|---|
| `context` | fork | fork |
| `allowed-tools` | `[Read, Grep, Glob]` | `[Read, Write, Grep, Glob]` |
| Purpose | Read-only audit | Generates a new file |

Both fork — they're heavy, verbose operations. Forking keeps the main session's
context clean (you'll see this pattern again with the Explore subagent in
Concept 5.4 — Planning Mode).

---

You will be given the path to a source file. Read it, understand the public
surface, and write a colocated test file (`<name>.test.ts` next to it).

Rules:

- One `describe` block per exported function/class.
- Within each `describe`, one `it` block per **behavior** — happy path plus at
  least two failure paths.
- Use the project's data-factory pattern (check `./tests/factories/` if it exists
  before inventing).
- If the source file pulls in an MCP server or external service, do not mock the
  transport — read this project's testing rule (`.claude/rules/testing.md`).
