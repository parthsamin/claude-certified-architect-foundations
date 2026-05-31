# Module 13 — Claude Code Built-in Tools

> Exam relevance: Domain 2 (Tool Design & MCP, **18%**) + Domain 3 (Claude Code Configuration, **20%**).

---

## 13.1 Tool selection reference

| Task | Tool | Example |
|---|---|---|
| Find files by name / pattern | **Glob** | `**/*.test.tsx`, `src/**/*.ts` |
| Search WITHIN file contents | **Grep** | function name, error msg, import |
| Read a file in full | **Read** | Load a file for analysis |
| Write a NEW file | **Write** | Create from scratch |
| Edit an existing file precisely | **Edit** | Replace a unique snippet |
| Run a shell command | **Bash** | git, npm, tests, build |

**Decision rule:** filename pattern → Glob; content search → Grep. Never reach for Bash `grep`/`find` — the built-in tools are safer and better-formatted.

## 13.2 Incremental investigation strategy

Build understanding via **traversal**, not bulk-read.

```
1. Grep — find entry points (function def, export)
2. Read — load those files
3. Grep — find usages (imports, calls)
4. Read — load consumer files
5. repeat — until the slice you need is in context
```

Why traversal wins: bulk-read fills context with irrelevant code; traversal builds exactly the dependency slice the task requires. Composes with the **Explore subagent** (Module 5.4) — the subagent runs this loop internally.

## 13.3 Fallback: Read + Write instead of Edit

`Edit` requires a **unique** snippet of text in the file. When the snippet appears multiple times, Edit can't disambiguate and fails.

```
1. Read  — full file content
2. Modify programmatically (string ops, regex, AST)
3. Write — emit the updated file
```

Use this when:
- The target text appears multiple times.
- The change is structural (re-ordering) rather than textual.
- You need to act on the N-th occurrence of a pattern.

Cost: re-emits the whole file. Trade-off: deterministic when Edit can't disambiguate.

## Exam traps

- "Find every test file" → **Glob** `**/*.test.{ts,tsx}`. Not Grep.
- "Find every place that calls `process_refund`" → **Grep**. Not Glob.
- "Edit failed: snippet not unique" → fall back to Read + Write.
- "Should I use shell `find` / `grep` from Bash?" → No — use the **Glob / Grep** tools.
- "How should the agent explore an unfamiliar codebase?" → **incremental traversal** (Grep entry points → Read those → Grep callers → Read those → repeat). NOT bulk read of all files.
