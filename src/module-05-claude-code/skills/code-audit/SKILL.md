---
context: fork
allowed-tools: ["Read", "Grep", "Glob"]
argument-hint: "Path to the directory or file to audit"
---

# /code-audit — architecture and dependency audit

Real path: `.claude/skills/code-audit/SKILL.md`. Invoked by typing `/code-audit`.

This is the **current `.claude/skills/`** format — a directory containing a
SKILL.md with YAML frontmatter. The frontmatter is the part that distinguishes
a skill from a plain slash command. Three frontmatter knobs to know for the exam:

| Knob | Effect |
|---|---|
| `context: fork` | Runs the skill in an **isolated subagent**, not the main session. The subagent's verbose output (file dumps, grep results) does not pollute the main context window. |
| `allowed-tools: ["Read", "Grep", "Glob"]` | **Security** — restricts which built-in tools the skill can use. This skill audits code (read-only) and is given **no write/edit tools** — it physically cannot modify files even if asked. |
| `argument-hint: "..."` | Prompt shown to the user when they invoke the skill without an argument. Helps avoid "what was I supposed to pass?" friction. |

---

Audit the directory or file the user specified. Produce a report on:

1. **Module structure** — top-level packages and what each is responsible for.
2. **Dependencies** — external packages used, plus any internal cross-package
   imports that suggest unintended coupling.
3. **Architectural patterns** — recurring conventions (DI, factories, event
   buses) and any places that deviate from them.
4. **Hot spots** — files with many imports or many importers (likely high-risk
   touch points for refactors).

Read-only tools only — do not propose or attempt edits. Surface findings; let
the user decide what to act on.

Output a structured markdown report (use the headers above).
