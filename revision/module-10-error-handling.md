# Module 10 — Error Handling in Multi-Agent Systems

> Exam relevance: Domain 5 (Context Management & Reliability, **15%**).

---

## 10.1 Error categories

| Category | Examples | Retryable | Agent action |
|---|---|---|---|
| **Transient** | Timeout, 503, network | Yes | Retry with exponential backoff |
| **Validation** | Invalid input shape, missing field | No (fix input) | Modify request, retry |
| **Business** | Policy violation, threshold exceeded | No | Explain, propose alternative |
| **Permission** | Access denied | No | **Escalate** (Module 9) |

## 10.2 Anti-patterns

| Anti-pattern | Why bad | Correct approach |
|---|---|---|
| Generic "search unavailable" | Coordinator can't decide how to recover | Return error type, query, partial results, alternatives |
| Silent suppression (empty result == success) | Coordinator thinks no matches; actually was a failure | Distinguish "no results" from "search failure" |
| Abort whole workflow on one failure | You lose all partial results | Continue with partials, **annotate the gap** |
| Infinite retries inside subagent | Latency + wasted resources | 1–2 retries local, then **propagate** to coordinator |

## 10.3 Structured subagent error

```json
{
  "status": "partial_failure",
  "failure_type": "timeout",
  "attempted_query": "AI impact on music 2024",
  "partial_results": [{"title": "AI Music Generation Report", "url": "...", "relevance": 0.8}],
  "alternative_approaches": ["Narrower query: ...", "Try an alternative data source"],
  "coverage_impact": "Not covered: AI in music distribution"
}
```

The coordinator can now decide:
- Retry with a modified query?
- Use partial results?
- Delegate to a different subagent?
- Continue with this section annotated as partial?

## 10.4 Coverage annotations in synthesis

```markdown
### Music (PARTIAL COVERAGE — search agent timeout)
[partial results]
⚠️ Limited coverage due to timeout in the search agent.
```

Mark every section by coverage status: **FULL COVERAGE** or **PARTIAL COVERAGE — <reason>**. The reader can immediately see what's reliable and what's not. **Never silently hide a failed section**.

## Build

`npm run m10:coverage` — same set of subagent results (one partial failure). BAD synthesis silently drops the failed section; GOOD synthesis includes a "PARTIAL COVERAGE — timeout" annotation.

## Exam traps

- "Subagent timed out; coordinator should..." → continue with partials, **annotate**. Not "abort everything."
- "Coordinator sees `[]` from a search and assumes 'no results'" → silent suppression; distinguish empty success from failure in the response shape.
- "Subagent infinitely retried internally" → 1–2 retries local, then propagate.
- "Final report doesn't mention the music section that failed" → coverage annotations missing.
- "How does a structured subagent error help the coordinator?" → it lets the coordinator branch on `failure_type`/`isRetryable`/partials — exactly what a generic "operation failed" can't enable.
