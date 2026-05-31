# Module 7 — Message Batches API

> Exam relevance: Domain 4 (Prompt Engineering & Structured Output, **20%**). Bulk processing patterns.

---

## 7.1 What the Batch API is

| Attribute | Value |
|---|---|
| Pricing | **50% discount** vs synchronous |
| Latency SLA | **Up to 24 hours**, no guarantee |
| Multi-turn tool calling | **NOT supported** — one request, one response |
| Correlation | `custom_id` field per request |

## 7.2 Batch vs Synchronous

| Task | API | Why |
|---|---|---|
| Pre-merge PR check | **Synchronous** | A human is waiting — 24h unacceptable |
| Overnight tech-debt report | **Batch** | Have-by-morning, 50% cheaper |
| Weekly security audit | **Batch** | Not urgent, bulk pricing |
| Interactive code review | **Synchronous** | Immediate feedback required |
| 10,000-document extraction | **Batch** | Savings dominate at scale |

**Decision rule:** Synchronous if a human is waiting; Batch otherwise.

## 7.3 `custom_id`

```json
{ "custom_id": "doc-invoice-2024-001", "params": { "model": "...", ... } }
```

`custom_id` is how you link a result back to its input. You set it; the API echoes it on the result. Without it the results are an anonymous pile.

**Concrete wins from custom_id:**
- Re-correlate result → original document.
- On partial failure, **re-submit only the failed items** by their ids.
- Avoid re-processing successful documents.

## 7.4 Handling failures

Pattern: submit 100, 95 succeed, 5 fail (e.g. context too long). Use `custom_id` to identify the failures, fix the strategy (split documents, narrow extraction), and re-submit ONLY those 5.

## 7.5 SLA planning

Need result in N hours, batch SLA is 24h → submission window = N − 24.
- Need in 30h → submit ≤ 6h after start.
- Frequent submissions → split into windows of 4h (or whatever your batch cadence is).

## Build

`npm run m7:batches` — submits 5 ticket-classification requests with meaningful custom_ids (`TKT-001..TKT-005`), polls until ended, prints results correlated by custom_id.

## Exam traps

- "We need results fast for a CI PR check" → **synchronous**, never batch.
- "Overnight tech-debt scan of the repo" → **batch**, save 50%.
- "100-doc batch returned with 5 failures — what next?" → identify by `custom_id`, fix strategy, re-submit ONLY those 5.
- "Multi-turn agentic workflow in a batch" → **NOT supported**; batch is one request → one response.
- "Need by 9am, batch takes up to 24h" → submit before 9am-prev-day (− 24h).
