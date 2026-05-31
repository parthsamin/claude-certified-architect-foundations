# Coding Style

Imported into the project-level CLAUDE.md via `@./standards/coding-style.md`.
Anything specific to *how code is written* belongs here, not in CLAUDE.md.

## Language & syntax

- ES Modules only — `import`/`export`. No `require`.
- Top-level `await` is fine (Node 18+, ESM).
- Prefer `const`. Use `let` only when the binding actually changes.
- Avoid `any`/loose typing in JSDoc when types are clear.

## Formatting

- 2-space indent. No tabs.
- Single quotes for strings unless escaping is shorter with double quotes.
- Trailing commas in multi-line arrays/objects.
- Max line length: 100 chars (soft).

## Error handling

- Surface failures, do not swallow them. Top-level `.catch()` in every script's
  `main()` that prints the error and exits with code 1.
- For agent loops, *throw* on unexpected `stop_reason` and on `maxIterations`
  exhaustion — silent "success" on safety caps is a Module-3 anti-pattern.

## Comments

- Comment **why**, not what. A reader can see *what* — explain motivation.
- Exercise files are the exception: heavy commentary is part of the teaching.
