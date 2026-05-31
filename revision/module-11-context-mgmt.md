# Module 11 — Context Management in Production

> Exam relevance: Domain 5 (Context Management & Reliability, **15%**).

---

## 11.1 Extract facts into a separate block

Don't rely on history (lossy under `/compact` — Module 5.5). Maintain a **structured fact block** included in every prompt.

```
=== CASE FACTS (updated whenever new) ===
Customer ID: CUST-12345
Order ID: ORD-67890
Order Amount: $89.99
Issue: Damaged item on delivery
Status: Pending manager approval
===
```

Survives summarization. Exact numbers/dates stay exact.

## 11.2 Trim tool results

If `lookup_order` returns 40 fields and you need 5, drop the 35 in a `PostToolUse` hook (Module 3.5). You measured the token gap in Module 1.6 (`m1:context`).

## 11.3 Position-aware input

Put critical content at **start** or **end**. Mid-input data gets missed (lost-in-the-middle).

```
[KEY FINDINGS — top]
3 critical vulnerabilities found.

[DETAILS — middle]
...big content blob...

[ACTION ITEMS — bottom]
Priority: fix auth.ts before merge.
```

## 11.4 Scratchpad files

For long investigations, write durable findings to disk. Next session re-reads instead of re-discovering. Connects to Module 5.7's "start fresh with summary" pattern.

```markdown
# investigation-scratchpad.md
## Key findings
- PaymentProcessor in src/payments/processor.ts
- refund() called from 3 places
- PaymentGateway rate-limited 100 req/min
- Migration #47 added refund_reason NOT NULL — 2024-12-01
```

## 11.5 Delegate to subagents to protect context

The coordinator should never read 15 files itself. A subagent reads them and returns **one line of synthesis**. The coordinator keeps that one line in context — not the 15 files.

**Separate context layer:** the coordinator aggregates structured subagent outputs, holds global state, and allocates context budgets. Subagents get **minimal context** + an `allowedTools` whitelist + an instruction to return structured results (not raw dumps).

## 11.6 Structured state persistence

Each agent writes its state to a known location after each subtask. Coordinator loads a **manifest** on resume.

```json
// agent-state/web-search-agent.json
{ "status": "completed", "queries_executed": [...], "key_findings": [...], "coverage": [...], "gaps": [...] }

// agent-state/manifest.json
{ "web-search": "completed", "doc-analysis": "in_progress", "synthesis": "not_started" }
```

Survives crashes. Pairs naturally with `--resume` (Module 5.7) when files haven't drifted.

## Build

`npm run m11:state` — researcher processes 5 items, persists state after each. Simulated crash at item 3. `npm run m11:state -- -r` resumes from item 4 — skips the completed ones.

## Exam traps

- "Long session loses exact numbers" → fact block (11.1), NOT `/compact`.
- "Tool response has 40 fields, 35 are noise" → PostToolUse hook to trim.
- "Critical instruction buried in a long prompt is being ignored" → move it to start or end (lost-in-the-middle).
- "Agent re-explores the same 15 files every session" → scratchpad file.
- "Coordinator's context fills up reading raw subagent dumps" → instruct subagents to return structured synthesis; coordinator only sees one line.
- "Multi-phase workflow has to restart from scratch after a crash" → structured state persistence + manifest.
