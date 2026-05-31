# Module 5 — Claude Code Configuration and Workflows

> Exam relevance: Domain 3 (Claude Code Configuration & Workflows, **20%**). Configuration-heavy; almost every concept here is "what file goes where" or "which command for which symptom."

---

## 5.1 CLAUDE.md hierarchy and `@path` imports

Three-level hierarchy — more specific wins on conflicts:

| Level | Path | Scope | In VCS? |
|---|---|---|---|
| 1. User | `~/.claude/CLAUDE.md` | Your personal preferences across all projects | No |
| 2. Project | Root `CLAUDE.md` OR `.claude/CLAUDE.md` | All contributors to this project | **Yes** |
| 3. Directory | `CLAUDE.md` in a subdirectory | Only when editing files in that directory | Yes |

**Gotcha:** `~/.claude/CLAUDE.md` (tilde = user) is **not** the same as `.claude/CLAUDE.md` (relative = project). The tilde is everything.

**`@path` imports** — modularize a bloated CLAUDE.md:

```markdown
Coding standards are in @./standards/coding-style.md
```

- `@` immediately before the path (no space).
- Relative paths resolve relative to the file containing the import.
- Maximum nesting depth: **5**.
- **Always-include**, not conditional. (Conditional = `.claude/rules/` paths frontmatter.)

---

## 5.2 `.claude/rules/` with `paths` (conditional loading)

Topical rule files, loaded **only when Claude is editing a file matching `paths`**:

```yaml
---
paths: ["**/*.test.ts", "**/*.test.tsx"]
---
Tests must use describe/it. Do not mock the database.
```

| Mechanism | Use when |
|---|---|
| `.claude/rules/foo.md` + `paths:` | Conventions apply to files **scattered across many directories** (tests, migrations, generated code) |
| Directory-level `CLAUDE.md` | Conventions apply to one specific directory only — travels with the code |

Mental rule: **path-scoped rules track concerns; directory-CLAUDE.md tracks locality.**

---

## 5.3 Slash commands and skills

Both produce `/name` invocations. Two formats:

| Format | Location | Frontmatter |
|---|---|---|
| Legacy command | `.claude/commands/<name>.md` | No |
| Current skill | `.claude/skills/<name>/SKILL.md` | **YAML** |

Skill frontmatter knobs (exam-tested):

| Knob | Effect |
|---|---|
| `context: fork` | Runs in **isolated subagent** — verbose output doesn't pollute main session |
| `allowed-tools: [...]` | **Security** — restricts built-in tools available to the skill |
| `argument-hint: "..."` | Hint when invoked without an argument |

**Skill vs CLAUDE.md:**

- **Skill** = on-demand task (verb): `/review`, `/test-gen`, `/audit`.
- **CLAUDE.md** = always-on standards (declarative): style, conventions, project facts.

**Project vs personal:** `.claude/skills/` (committed, team) vs `~/.claude/skills/` (personal). **Name personal variants differently** from the team's commands — same name shadows the team version locally.

---

## 5.4 Planning mode vs direct execution

| Mode | What happens | Tools used | Best for |
|---|---|---|---|
| **Planning** | Investigate, produce written plan, **no changes** | Read, Grep, Glob | Large changes, multiple plausible approaches, unfamiliar codebase, library migrations 45+ files |
| **Direct execution** | Make changes immediately | All allowed tools | Single-file fixes with a clear diagnosis, mechanical refactors |

**Combined approach (the exam's usual right answer for big work):** plan → user approves → direct execute.

**Explore subagent** — codebase-exploration cousin of `context: fork`: isolates verbose reads in a subagent, returns only a summary, prevents context-window exhaustion in multi-phase tasks.

---

## 5.5 `/compact` and `/memory`

| | `/compact` | `/memory` |
|---|---|---|
| Scope | Current session's transcript | A `CLAUDE.md` file (project / user) |
| Persistence | Within the session | **Across** sessions |
| Effect on context | **Reduces** current size | Adds standing content on every session start |
| Failure mode | **Lossy on specifics** (numbers, dates) — Module 1.6 drift | None inherent |

Mental model: `/compact` = *forget on purpose to make room now*; `/memory` = *remember on purpose to save effort next time*.

**When you can avoid `/compact`, do.** Prefer the Explore subagent so noise never enters the main context.

---

## 5.5b Iterative Refinement (D3.5 in the exam domain notes)

A small concept that lives between the chapters: **iterative refinement** when working with Claude Code on development tasks.

| Technique | What it means |
|---|---|
| **Concrete I/O examples** | Give Claude 2–3 input/output pairs for the transformation you want (same as few-shot — Module 6.1, applied to dev workflow) |
| **Test-driven iteration** | Write the test cases *first* (happy path + edge cases + perf), then have Claude iterate the implementation until they pass |
| **Interview pattern** | Let Claude ask clarifying questions (Module 6.4) before committing to design choices |
| **All issues at once vs sequentially** | Interdependent issues → batch them in one message; independent issues → sequentially so the model can focus |

Engineering principle: **spec first, iterate until spec is met**. Same shape as Module 6.5 retry-with-feedback, applied to coding rather than to data extraction.

Exam framing: *"Best practice for refining a complex Claude Code implementation?"* → tests first + concrete examples + interview pattern when ambiguous. Not "just try and see."

---

## 5.6 Claude Code in CI/CD

Four exam-tested rules:

1. **Headless mode mandatory:** `claude -p "<prompt>"`. Without `-p` the job hangs.
2. **Structured output:** `--output-format json --json-schema '<schema>'`. Same syntax-validity guarantee as Module 2.3 tool_use + JSON Schema. **Semantic** correctness still requires a validator.
3. **Session context isolation:** the same Claude that generated code is **biased toward defending it** in review. Reviewer must be a separate `claude -p` invocation, fresh context.
4. **Prevent duplicate comments on re-review:** include prior review comments in the prompt and instruct Claude to report only new or unresolved issues.

---

## 5.7 `--resume` and `fork_session`

| Mechanism | What it does | Use when |
|---|---|---|
| `--resume <name>` | Continues prior named session with saved context | Yesterday's investigation, files unchanged |
| `fork_session` | Independent branch from shared context | Comparing two approaches off the same exploration |
| **Start fresh** (no resume) | New session seeded with a short summary | Files changed since last session; too much time passed; context degraded |

**Risk with `--resume`:** stale tool results — Claude reasons over yesterday's reads when files have changed. Confidently-wrong answers.

**Rule:** resume when state is intact; restart when state has drifted.

---

## Exam traps — Module 5

- "New teammate doesn't get project standards" → file at `~/.claude/CLAUDE.md` (tilde), should be project root `CLAUDE.md` or `.claude/CLAUDE.md`.
- "Conventions apply to scattered test files" → `.claude/rules/testing.md` with `paths: ["**/*.test.ts", ...]`. Not directory CLAUDE.md.
- "Conventions apply to one specific package only" → directory-level CLAUDE.md in that package.
- "Audit skill keeps deleting files" → remove the relevant tool (usually `Bash` for `rm`, possibly `Write`/`Edit`) from `allowed-tools`. Module 3.2 least-privilege at the skill layer.
- "200-line React rule block in root CLAUDE.md slowing every session" → move to `.claude/rules/react.md` with `paths: ["**/*.tsx", "**/*.jsx"]`.
- "60-file migration — direct execute or plan?" → plan first, then direct execute.
- "Off-by-one on a specific line — plan or direct?" → direct.
- "Vague mid-session answers about exact numbers" → `/compact` ran; lossy summary. Preserve facts before compacting, or use Explore subagent.
- "I re-explain my preferences every session" → `/memory` → write into `~/.claude/CLAUDE.md`.
- "CI hangs on the claude step" → missing `-p`.
- "Pipeline can't parse review output" → `--output-format json --json-schema`.
- "Bot defends the same code it wrote" → reviewer ≠ generator; separate `claude -p` invocation.
- "Resume gave confidently-wrong answers" → stale tool results from changed files; start fresh with a summary.
- "Two architectural approaches off the same exploration" → `fork_session`.
