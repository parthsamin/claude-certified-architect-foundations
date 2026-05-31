# Module 13 — Claude Code Built-in Tools

Reference card. Module 13 covers the built-in tools Claude Code uses
to operate on a codebase. There's no new agent code to write — the
material is the *tool selection logic*, the *incremental investigation
strategy*, and the *Read+Write fallback for Edit*. All exam-tested.

## 13.1 Tool selection reference

| Task | Tool | Example |
|---|---|---|
| Find files by name/pattern | **Glob** | `**/*.test.tsx`, `src/components/**/*.ts` |
| Search WITHIN file contents | **Grep** | function name, error message, import path |
| Read a file in full | **Read** | load a file for analysis |
| Write a NEW file | **Write** | create a file from scratch |
| Edit an existing file precisely | **Edit** | replace a specific snippet via UNIQUE text match |
| Run a shell command | **Bash** | git, npm, tests, build |

**Exam decision matrix:**

- "Find all `*.test.ts` files in the repo" → **Glob** (filename pattern).
- "Find every place that imports `lodash`" → **Grep** (content search).
- "Find files named `cache.ts` AND check what's inside them" → Glob first, then Read.
- "Change one identical line of code in 8 files" → Edit in each (text must be unique within each file; see 13.3).

A common trap: using Bash with `grep`/`find` from the shell. Don't —
use the **Grep / Glob tools**. Those are optimized for permissions and
output formatting; Bash equivalents bypass safety checks.

## 13.2 Incremental investigation strategy

The exam-tested workflow for understanding a new codebase: **do NOT
read all files at once.** Build understanding incrementally.

```
1. Grep   -> find entry points (function definition, export)
2. Read   -> load the found files (and only those)
3. Grep   -> find usages (import, calls)
4. Read   -> load consumer files
5. repeat -> until you have a complete picture
```

Why incremental wins over bulk-read:

- Bulk-read fills the context window with irrelevant code.
- The dependency graph is what matters; reading by traversal builds
  exactly the slice of the graph you need.
- Each Read is justified by a prior Grep result — you can defend why
  every file is in context.

This is the **Explore subagent** pattern from Module 5.4 done by hand
when you don't have a subagent — and it composes with that subagent
(the Explore agent runs incremental investigation internally).

## 13.3 Fallback: Read + Write instead of Edit

`Edit` finds a unique snippet of text in the target file and replaces
it. It fails when the snippet is **not unique** (the same text appears
multiple times). The exam-graded fallback:

1. **Read** the full file.
2. **Modify** the content programmatically (string manipulation,
   regex, AST — whatever fits).
3. **Write** the updated version back.

This works for ANY change Edit can't handle: bulk renames where the
old name appears many times, AST-level refactors, content moves
across the file. Cost: more tokens (you re-emit the whole file
content). Trade-off: when Edit can't disambiguate, the fallback is
deterministic.

Common other reasons to use Read + Write over Edit:
- The exact text to replace isn't known in advance (depends on a
  computation).
- You need to insert content at an N-th occurrence of a pattern,
  not the first.
- The change is structural (re-ordering functions) rather than
  textual.

## Exam traps — Module 13

- "Find all React components in the repo" → Glob `**/*.{jsx,tsx}`. Not Grep.
- "Find every file that calls `parseDate(...)`" → Grep. Not Glob.
- "Edit failed: the snippet appears 3 times in the file" → Read → modify → Write.
- "How should the agent explore an unfamiliar codebase?" → incremental: Grep
  for entry points → Read those → Grep for callers → Read those → repeat.
  Not "Read every file up front."
- "When should the agent shell out to `find` / `grep`?" → almost never.
  Use the Glob / Grep tools.
