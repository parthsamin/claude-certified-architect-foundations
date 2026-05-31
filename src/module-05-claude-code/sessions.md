# Session management — `--resume` and `fork_session`

Reference for Module 5 · Concept 5.7. Two related but distinct ways to
manage sessions across time and across exploration branches.

## `--resume <session-name>`

Continues a **prior** named session with its saved context.

```bash
claude --resume investigation-auth-bug
```

- Picks up the conversation where you left it: prior turns, prior tool
  results, prior reasoning — all in context for the next message.
- Useful for **long investigations spanning multiple sittings**:
  yesterday's exploration of the auth bug, today's continuation.

**The risk — exam-tested:** if files changed since the prior session,
**the tool results in history are stale**. The model reasons over what
it saw before, not what is currently true. You can end up with
confidently-wrong answers based on outdated reads.

## `fork_session`

Creates an **independent branch** from a shared point in a session.

```
Codebase investigation (shared up to here)
         |
     fork_session
    /              \
Approach A:         Approach B:
Use Redux           Use Context API
```

- Both forks inherit context up to the **branch point**.
- After branching, the forks **diverge independently** — turns in
  Approach A do not appear in Approach B and vice versa.
- Useful when **comparing approaches** or **testing strategies** —
  explore both options without each polluting the other.

## When to **start a new session** instead of resuming

The guide explicitly calls these out — they're exam-tested:

- **Tool results are stale.** Files changed since the prior session.
  Resuming would let Claude reason over outdated reads.
- **Too much time has passed.** Context degrades — references to "the
  bug we were chasing" point to investigation that's no longer fresh in
  the model's reasoning.
- **You can summarize the previous session in a few lines.** Better to
  restart with *"Here's what we found: <summary>"* than to drag forward
  old tool data that may not be true anymore.

In other words: **resume when state is intact, restart when state has
drifted.**

## Decision matrix

| Situation | Mechanism |
|---|---|
| Continuing yesterday's investigation, no file changes since | `--resume` |
| Trying two architectural approaches over the same exploration | `fork_session` |
| Resuming would replay stale tool reads on changed files | **Start fresh** with a summary seed |
| Long-running investigation that has accumulated a lot of context | Start fresh with a summary (avoid `/compact`'s lossy summarization) |

## Cross-references to earlier modules

- This pattern of *"start fresh with preserved facts"* is the
  scratchpad / facts-block pattern from **Module 1.6** at session scale.
- `fork_session`'s "shared up to branch, then independent" semantics is
  exactly the **isolated-context** principle of subagents
  (**Module 3.3**), applied to whole sessions.
- The "files changed → stale" risk is the same hazard as letting old
  cached MCP tool results into a fresh context — provenance matters
  (foreshadowing **Module 12**, which is precisely this problem at scale).
