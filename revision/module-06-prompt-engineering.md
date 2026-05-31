# Module 6 — Prompt Engineering

> Exam relevance: Domain 4 (Prompt Engineering & Structured Output, **20%**).

---

## 6.1 Few-shot prompting

Include **2–4 input/output examples** to teach a convention. The model generalizes — it doesn't replay.

**Five flavors (memorize):**

| # | Type | Use case |
|---|---|---|
| 1 | Ambiguous scenarios | Decision routing — *"broken" → look up order; "manager" → escalate* |
| 2 | Output formatting | Pin the exact shape of structured output |
| 3 | Acceptable vs problematic | Flag/don't-flag side-by-side for classifiers |
| 4 | Multiple document formats | Same target schema, different input shapes |
| 5 | Informal measurements | Normalize fuzzy phrases ("pinch", "splash") to metric |

**Stack normalization rules on top of the schema:**

```
Dates: ISO 8601 (YYYY-MM-DD); "yesterday" -> compute absolute date
Currency: {amount: number, currency: ISO code}; "five bucks" -> {5, USD}
Percentages: decimal fraction; "half" -> 0.5
```

Schema enforces structure; normalization rules enforce values. Few-shot is decisive when the **schema cannot encode the convention** (decision rules, domain conventions, non-obvious routing).

---

## 6.2 Explicit criteria vs vague instructions

| Bad | Good |
|---|---|
| "Be conservative" | "Flag ONLY if: 1) … 2) … 3) …" + "Do NOT flag: … …" |
| "Use appropriate severity" | Per-tier definition + canonical example |

The **DO-NOT-FLAG exclusion list is half the work** — it carves the boundary the model would otherwise guess.

| Severity tier | Definition | Example |
|---|---|---|
| CRITICAL | Runtime failure for users | NPE while processing a payment |
| HIGH | Security vulnerability | SQL injection, XSS, missing auth |
| MEDIUM | Logic bug, no immediate impact | Wrong sort, off-by-one |
| LOW | Code quality | Duplication, sub-optimal algorithm |

**Composition rule:** criteria *describe*; examples *demonstrate*. Use both when convention is non-trivial.

---

## 6.3 Prompt chaining

Break a complex multi-input task into a sequence of focused steps. Each step has one goal; each gets the full attention budget on its narrow input.

```
Step 1: analyze auth.ts        -> issues_auth
Step 2: analyze database.ts    -> issues_db
Step 3: integration pass over both (with prior outputs) -> cross-file issues
```

**Chaining vs dynamic decomposition** (exam-tested):

| | Chaining | Dynamic decomposition |
|---|---|---|
| Who decides the steps | **You**, up front | Coordinator agent at runtime |
| Use when | Steps stable across inputs | Steps depend on what's found |
| Examples | Code review, ETL, migrations | Open-ended investigation |

Failure mode chaining fixes: **attention dilution** — when too many files / tasks are crammed into one call, the model misses bugs and gives shallow commentary.

---

## 6.4 The "Interview" pattern

Claude asks clarifying questions **before** implementing. Surfaces design decisions the model can't reasonably infer.

**Use when:**
- Unfamiliar domain (fintech, healthcare, legal)
- Non-obvious implications (caching strategies, failure modes)
- Multiple viable approaches, right choice depends on context

**Requires `tool_choice: "auto"`.** Forced tool-use (`any` or `tool`) **prevents** the interview because the model can't emit a text-only turn — it can't ask a question.

Composes with **planning mode (Module 5.4)**: planning + interview = deliberate, conservative work surface for large ambiguous tasks.

---

## 6.5 Validation and retry-with-feedback

Same defense-in-depth as Module 2.4: schema → validator → retry-with-feedback → cap + escalate.

**Retry WILL help:**

- Format errors (date in wrong format)
- Structural errors (value in wrong field)
- Arithmetic inconsistencies (sums, ratios — model can re-check)

**Retry will NOT help — escalate instead:**

- The information is genuinely absent from the source
- The required context is external (in a document not provided)

**Pydantic** (Python; equivalents in Node: Zod, Yup, Joi, TypeBox) plays four roles:

1. **JSON Schema generation** — Pydantic model emits the `tool_use` schema (single source of truth)
2. **Structural validation** — types, required fields, enums on returned JSON
3. **Semantic validation** — custom validators (sum == total, start < end)
4. **Retry-feedback message construction** — produce the specific error string for the next prompt

Reference build: `src/module-02-tools/04-errors.js`.

---

## 6.6 Self-correction

Ask the model to extract **both** a stated value and a **computed** value, and flag a conflict.

```json
{
  "stated_total": 150.00,
  "computed_total": 145.00,
  "conflict_detected": true,
  "reason": "stated 150 != sum 145",
  "line_items": [...]
}
```

**Self-correction vs retry-with-feedback:**

| | Self-correction | Retry-with-feedback |
|---|---|---|
| Conflict detected by | **Model**, in same response | **External validator**, after the call |
| Best when | Source itself may be inconsistent | Source is correct, model occasionally errs |
| Cost | One call | N attempts |
| Audit trail | Built into the response | Reconstructed from the loop log |

Self-correction shines for invoices with wrong totals, reports whose summary contradicts their numbers, contracts with inconsistent dates — anywhere the **source** is the source of truth-conflict and retry can't fix it.

---

## Exam traps — Module 6

- "Output format varies between runs" → few-shot examples + normalization rules in prompt.
- "Currency values come back as `"$5"` vs `"5.00"` vs `{amount, currency}`" → normalization rule + few-shot. Schema alone insufficient — that's syntax, this is semantic drift.
- "Classifier inconsistent on edge cases" → explicit FLAG / DO-NOT-FLAG criteria + tier example per category.
- "Severity tiers feel arbitrary" → add definition + canonical example per tier in the prompt; schema enum alone isn't enough.
- "Bot reviews 30 files at once and misses bugs" → attention dilution → prompt chaining.
- "Bot proceeds with guessed defaults when asked an ambiguous task" → set `tool_choice: "auto"` so the interview pattern can fire.
- "Tool_choice was changed to `any` and now the agent stopped asking clarifying questions" → forced tool-use disables the interview; revert to `auto`.
- "Retry loop runs 5 times on absent data and gives up" → retry doesn't fix missing data; mark field nullable, escalate.
- "What is Pydantic for?" → schema gen + structural validation + semantic validation + retry-feedback construction (the four roles).
- "Invoice's printed total disagrees with line items, the retry loop spins" → use self-correction (extract both, flag conflict), then escalate. Source is the bug, not the model.
- "Should `total == sum(items)` be a schema constraint?" → no — value relationships are *semantic*, not structural. Use a validator (6.5) or self-correction (6.6).
