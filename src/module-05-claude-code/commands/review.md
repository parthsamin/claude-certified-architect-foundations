# /review — code review command

In a real Claude Code project this file would live at `.claude/commands/review.md`
and would be invoked by typing **`/review`** in a Claude Code session. The file
*contents* are the prompt template that gets sent to Claude when the command runs.

This is the **legacy `.claude/commands/`** format — still supported. It's a plain
markdown file with no frontmatter. Anything before the body is the command's
prompt template; arguments passed by the user are appended.

---

You are performing a code review on the changes in the current git diff or the
file the user has specified.

Focus on, in this order:

1. **Correctness** — does the code do what it claims? Trace the happy path and
   at least two failure paths.
2. **Hidden side effects** — global state, mutation of inputs, network calls
   smuggled into "pure" functions.
3. **Error handling** — every `await` in an unhappy path; no silent catches.
4. **Naming** — does each identifier carry the meaning it implies?
5. **Test gaps** — what behaviors aren't covered?

Do NOT spend time on style — formatting is enforced by the project's linter.

Output structure:

- **Verdict:** one of `ship`, `ship with nits`, `needs work`, `block`.
- **Top three issues** in priority order, each with a one-line proposed fix.
- **Nits** (optional, terse).
