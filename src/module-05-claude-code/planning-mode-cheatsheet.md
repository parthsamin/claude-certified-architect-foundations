# Planning Mode vs Direct Execution — cheatsheet

Reference card for Module 5 · Concept 5.4. In a real Claude Code session
planning mode is toggled by the user (e.g. shift-tab in interactive mode);
the choice between planning and direct execution is an **architectural**
decision about how to *approach* a task.

## Two modes

### Planning mode
- The model **investigates and plans**; it does **not** make changes.
- Tools used: `Read`, `Grep`, `Glob` (read-only).
- Output: a written plan the user reviews and approves.
- Safe: no file edits, no side effects.

### Direct execution
- The model goes straight to making changes.
- All tools available subject to `allowed-tools`.
- Faster for well-scoped work; risky for ambiguous work.

## Decision matrix

| Situation | Mode | Why |
|---|---|---|
| Single-file fix with a clear stack trace | **Direct** | The diagnosis already exists; planning adds latency without value |
| Add one validation check to an existing endpoint | **Direct** | Tiny, unambiguous change |
| Rename a function used in 3 files | **Direct** | Mechanical, low-risk |
| Library migration touching ~45+ files | **Planning first** | Lots of files, many decisions per file — plan once, execute deterministically |
| Architectural decision (microservice boundaries, framework choice) | **Planning** | Multiple plausible answers — write them down, choose, then execute |
| Unfamiliar codebase, first feature | **Planning** | You must understand before changing — exploration is the work |
| "Refactor the auth module" (scope unclear) | **Planning** | "Refactor" without a target is ambiguous; plan to clarify scope |

## Combined approach (most common in practice)

1. **Planning mode** — investigate, propose options, write the plan.
2. **User approves / adjusts the plan.**
3. **Direct execution** — implement the approved plan.

This pattern shows up explicitly on the exam. The "right answer" to a
question describing a 45-file migration is almost always *"planning mode
to design the migration, then direct execution to apply it"* — not
"just one or the other."

## The Explore subagent

A specialized subagent **for code exploration**:

- Isolates verbose output (giant Read dumps, multi-page Grep results) from
  the main context.
- Returns only a **summary** back to the parent session.
- Prevents context-window exhaustion in multi-phase tasks where you need
  to explore once and then act several times.

When to reach for it: any time you'd otherwise drown the main session in
exploratory tool output. Compare to `context: fork` on skills (Concept 5.3)
— same architectural pattern (fork to isolate verbose work), applied to a
specific built-in role.

## Anti-patterns

- **Direct execution on a 45-file migration.** You end up making the wrong
  early decisions and then patching them across the changes. Plan first.
- **Planning mode on a one-line fix.** Wastes an entire round of
  exploration on a problem you've already diagnosed.
- **Skipping the user approval step** between plan and execution. The
  whole point of the planning phase is to expose your reasoning *before*
  changes happen — bypassing the approval pretends to do that without
  actually getting human sign-off.
