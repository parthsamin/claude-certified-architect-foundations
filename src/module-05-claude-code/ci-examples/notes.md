# Claude Code in CI/CD — notes

Reference for Module 5 · Concept 5.6. The exam tests **four** specific
operational rules around running Claude Code from a CI pipeline.

## 1. Headless mode is mandatory

The `-p` (a.k.a. `--print`) flag puts Claude Code into **non-interactive**
mode:

```bash
claude -p "Analyze this pull request for security issues"
```

- Processes the prompt, prints to stdout, exits.
- Does **not** wait for user input.
- This is the **only correct way** to run Claude in CI/CD pipelines.
  Interactive mode hangs forever waiting on a terminal that doesn't exist.

## 2. Structured output for parseable results

`--output-format json` + `--json-schema '<schema>'` produce machine-readable
output the next pipeline step can parse without regex heroics.

```bash
claude -p "Review this PR" \
  --output-format json \
  --json-schema '{"type":"object","properties":{...}}'
```

The result can be parsed to **automatically post inline PR comments**,
fail the build on `severity: "block"` issues, write summary annotations,
etc.

## 3. Session context isolation

> *"The same Claude session that generated code is often less effective at
> reviewing it (the model retains its reasoning context and is less likely
> to challenge its own decisions). Use an independent instance for review."*

This is one of the exam's most-tested operational rules. The implication
for CI: **the reviewer must be a separate `claude -p` invocation** from
whatever generated the code. Do not pass the generation session's history
into the review — start fresh.

Mental model: a code reviewer who watched you write the code is biased
toward agreeing with your reasoning. An independent reviewer pushes back
more honestly. Same with Claude.

## 4. Preventing duplicate comments on re-review

When CI re-runs on new commits, naive re-review will repost the same
comments. The guide's rule: **include prior review results in context
and instruct Claude to report only new or unresolved issues.**

In practice this means: before running the review step, fetch any prior
Claude review comments from the PR, include them in the prompt, and
explicitly say "do not repeat issues from the prior review unless they
are still present."

## Quick reference

| Need | Flag / pattern |
|---|---|
| Non-interactive CI invocation | `claude -p "<prompt>"` |
| JSON output | `--output-format json` |
| Validated JSON shape | `--json-schema '<json-schema>'` |
| Reviewer != generator | Separate `claude -p` invocation, fresh context |
| De-dup PR comments on re-review | Include prior comments + "only new issues" instruction |
