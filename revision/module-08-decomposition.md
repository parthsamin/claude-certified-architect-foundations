# Module 8 — Task Decomposition Strategies

> Exam relevance: Domain 1 (Agent Architecture & Orchestration, **27%**).

---

## 8.1 Fixed pipelines (prompt chaining)

Steps **fixed up front** in code. Same shape every run.

```
Document → metadata extraction → data extraction → validation → enrichment → final
```

Use when:
- Task structure is predictable.
- All steps are known up front.
- You need stability and reproducibility.

## 8.2 Dynamic adaptive decomposition

Subtasks are **generated at runtime** based on intermediate results. This is what a Module-3 coordinator agent does with the `Task` tool.

```
1. "Add tests for legacy codebase"
2. → first map structure (Glob, Grep)
3. → found: 3 modules with no tests, 2 with partial coverage
4. → prioritize: start with payments (high risk)
5. → during work: depends on external API
6. → adapt: add a mock before writing tests
```

Use when:
- Task is open-ended / investigative.
- Full scope unknown up front.
- Each step's plan depends on the previous step's result.

## 8.3 Multi-pass code review

For a 10+ file PR, **do not** review everything in one prompt.

```
Pass 1 (per-file): auth.ts        → local issues
Pass 1 (per-file): database.ts    → local issues
Pass 1 (per-file): routes.ts      → local issues
...
Pass 2 (integration): cross-file  → boundary issues
```

Single-pass on many files fails three ways:
- **Attention dilution** — deep on some, shallow on others.
- **Inconsistent verdicts** — same pattern flagged in one file, ignored in another.
- **Missed bugs** — obvious errors skipped under cognitive load.

## Decision matrix

| Situation | Strategy |
|---|---|
| 60-file migration, same shape per file | **Fixed pipeline** (prompt chaining) |
| Investigate why a service is slow | **Dynamic decomposition** |
| Add tests to a legacy module | **Dynamic decomposition** |
| Extract structured data from a 10k-doc corpus | **Fixed pipeline** + **batch API** |
| Review a 14-file PR | **Multi-pass** (per-file → integration) |

## Build

`npm run m8:passes` — single-pass vs multi-pass review of a 3-file PR with deliberate cross-file authorization holes. Multi-pass surfaces more issues, especially cross-file.

## Exam traps

- "Bot reviews 14-file PR and misses obvious bugs in 4 of them" → attention dilution → multi-pass.
- "Predictable invoice-extraction pipeline" → fixed (chaining), not dynamic.
- "Open-ended investigation, can't pre-list subtasks" → dynamic decomposition via coordinator + Task.
- "Single-pass vs multi-pass on big PR — which is more reliable?" → multi-pass; per-file then integration.
