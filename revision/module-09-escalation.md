# Module 9 — Escalation and Human-in-the-Loop

> Exam relevance: Domain 5 (Context Management & Reliability, **15%**).

---

## 9.1 When to escalate — RELIABLE triggers

| Situation | Action |
|---|---|
| Customer explicitly requests "manager" / "human" | **Immediate** — do NOT attempt to solve |
| Policy does not cover the request | Escalate (e.g., competitor price match when silent) |
| Agent can't make progress after reasonable attempts | Escalate |
| Financial op above a threshold | Escalate (prefer **hook** over prompt — Module 3.5) |
| Multiple matches on customer lookup | Ask for ID; do NOT guess |

## 9.1 — UNRELIABLE triggers (do NOT use)

| Method | Why it fails |
|---|---|
| Sentiment ("customer sounds mad") | Mood ≠ case complexity |
| Model self-rated confidence 1–10 | Model is confidently wrong; calibration is poor |
| Heuristic ML classifier | Overengineering; you'd need training data you don't have |

## 9.2 Escalation patterns

- **Immediate.** "Get me a manager" → escalate now, no resolution attempt.
- **After attempt.** Damaged item → offer replacement → escalate only if customer rejects.
- **Nuanced.** Frustration ≠ explicit request. Acknowledge emotion → offer solution → escalate only on reiteration of "human."
- **Policy gap.** Request outside policy scope (competitor matching when policy is silent) → escalate immediately.

## 9.3 Structured handoff protocols

When escalating, send a **self-contained JSON**. The human operator does NOT see the conversation; the handoff is all they get.

```json
{
  "customer_id": "CUST-12345",
  "customer_name": "...",
  "issue_summary": "...",
  "order_id": "...",
  "root_cause": "...",
  "actions_taken": ["verified via get_customer", "..."],
  "recommended_action": "Approve full refund",
  "escalation_reason": "Customer requested a manager"
}
```

The handoff must include everything the operator needs to act without reading the transcript.

## 9.4 Confidence calibration & human oversight

For data-extraction systems:

1. **Field-level confidence scores** — per-field, not per-document.
2. **Calibration** — tune thresholds on labeled validation sets.
3. **Routing** — high-confidence to automation, low-confidence to human.
4. **Stratified random sampling** — even high-confidence extractions get periodic audits. Aggregate 97% accuracy can hide 40% errors on a specific doc type.

## Build

`npm run m9:escalate` — four scenarios: explicit-request → immediate, policy-gap → immediate, damaged-item → attempt-then-escalate-on-insistence. Each produces a self-contained structured handoff.

## Exam traps

- "Customer says 'I want a manager'" → IMMEDIATE escalation, do NOT attempt to fix first.
- "Customer is angry but hasn't asked for a manager" → acknowledge emotion, attempt resolution; do NOT escalate on sentiment.
- "Should we use the model's self-reported confidence as the escalation trigger?" → NO, confidence is poorly calibrated.
- "Handoff is just 'customer wants a refund'" → not self-contained; operator can't act. Include customer/order ids, actions taken, recommended action, root cause.
- "Refund over $500 sometimes slips through despite the prompt rule" → use a **hook** (Module 3.5), not a prompt-only rule.
- "Customer search returned 3 possible matches — pick the closest?" → NO, ask the customer for an ID; do not guess.
