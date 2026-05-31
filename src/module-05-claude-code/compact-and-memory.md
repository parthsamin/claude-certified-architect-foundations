# `/compact` and `/memory` — built-in commands

Two built-in Claude Code commands. Both touch context — but they solve
*opposite* problems and live on opposite ends of the session lifecycle.

## `/compact` — summarize the current session's history

**Purpose:** compress the active conversation history to free up the
context window when it fills with verbose tool output (long file reads,
multi-page grep results, MCP tool dumps).

**Mechanism:** the model summarizes the prior turns and replaces the
original messages with the summary. The window now has room to continue.

**Risk — exam-tested:** summarization is **lossy on specifics**. The
guide is explicit: *"exact numeric values, dates, and specific details
can be lost during summarization."* This is the same failure mode as
**progressive summarization drift** from Module 1.6 — `/compact` is
literally that failure mode, but on demand.

**When to use:**

- Long investigation sessions where the next turn keeps hitting the
  context cap.
- After a heavy exploration phase, before moving into execution.

**When NOT to use:**

- When recent exact numbers/dates matter for the upcoming work — extract
  them into a preserved facts block first (Module 1.6 mitigation), or
  use the Explore subagent (Concept 5.4) instead so the verbose output
  never enters the main context in the first place.

## `/memory` — edit the session-persistent CLAUDE.md

**Purpose:** open the relevant `CLAUDE.md` for editing so the user can
save notes, preferences, project conventions, and current-work context
that should **persist across sessions**.

**Mechanism:** opens the `CLAUDE.md` file in the editor — typically the
project-level one, but the level depends on context. Information saved
here is auto-loaded into every future session in scope.

**Useful for:**

- Project conventions you keep having to re-explain.
- User preferences (response style, output format) — likely user-level.
- Frequently used commands, debugging tips, infrastructure quirks.
- "Current state" notes: *"working on the auth refactor, branch `xy-123`,
  blocked on legal review of token storage"*.

**The architectural framing:**

> `/memory` is the **alternative to re-explaining the same instructions
> in every session**. You write the standing context once into
> `CLAUDE.md`; future sessions auto-load it. Compare to a system prompt
> rewritten by hand each time.

## Side-by-side

| | `/compact` | `/memory` |
|---|---|---|
| Scope | Current session's *transcript* | A `CLAUDE.md` file (project / user) |
| Persistence | Compresses *within* the session | **Across** sessions |
| Effect on context | Reduces current usage | Adds standing content on every session start |
| Failure mode | Lossy on exact specifics | None inherent; depends on what you write |
| Module 1.6 link | Same risk as summarization drift | Same role as the "facts block" mitigation |

## Exam traps

- "The agent's answers got vaguer about exact numbers after a long session
  — what happened?" → `/compact` was run; specifics got summarized away.
  Fix = avoid `/compact` when exact data matters, or extract figures to a
  scratchpad/facts block first.
- "Every session, I re-explain the project's conventions" → use `/memory`
  to write them into `CLAUDE.md` once.
- "Should I `/compact` when verbose tool output is filling the window?" →
  Better: use the Explore subagent (Concept 5.4) so the verbose output
  never enters the main context.
