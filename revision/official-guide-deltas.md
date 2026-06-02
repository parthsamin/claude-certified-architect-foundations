# Official Guide Deltas

> Patterns the **Anthropic official guide** (`claude_guide.pdf`, v0.1
> Feb 10 2025) emphasizes more than the community guide our curriculum
> was originally built around. Most overlap; these are the gaps worth
> closing before sitting the exam.
>
> Audit method: every "Knowledge of" and "Skills in" bullet across all
> 29 task statements (Domains 1–5) cross-checked against the lab's
> 13 modules. Items below are the ones we covered lightly or by
> implication rather than explicitly.

---

## High priority — sample questions directly test these

### Δ1. Programmatic prerequisite gate (Task 1.4 · Sample Q1, answer A)

**Pattern.** Block a downstream tool call until a prerequisite tool has returned a verified value. Example: in a customer-support agent, block `lookup_order` and `process_refund` until `get_customer` has returned a verified customer ID.

**How it differs from a generic hook.** Hooks (Module 3.5) are the *mechanism*; a prerequisite gate is the *workflow pattern*. The gate's logic: *"Did tool X complete with a non-error result containing field Y? If yes, allow tool Z. If no, redirect to retry-X or escalate."*

**Sample-question framing.** *"In 12% of cases, the agent skips `get_customer` entirely and calls `lookup_order` using only the customer's stated name, leading to misidentified accounts. What change most effectively addresses this?"*

| Option | Verdict |
|---|---|
| **A. Programmatic prerequisite blocking `lookup_order`/`process_refund` until `get_customer` returned verified ID** | **✓ Correct** — deterministic, financial consequences |
| B. Strengthen the system prompt | Probabilistic; insufficient for financial ops |
| C. Add few-shot examples showing the right order | Probabilistic; same problem as B |
| D. Routing classifier that enables only the right tool subset | Addresses tool *availability*, not *ordering* — wrong root cause |

**Diagnostic shorthand.** *Required tool sequence + financial / safety consequences* → prerequisite gate, not prompt.

---

### Δ2. Scoped cross-role tools for high-frequency cases (Task 2.3 · Sample Q9, answer A)

**Pattern.** When a subagent frequently needs a capability that "belongs" to another role, give it a **narrow** version of that capability for the common case — while still routing complex cases through the coordinator.

**Concrete example.** Synthesis agent frequently needs to verify simple facts (dates, names, statistics). Round-tripping through the coordinator to a web-search subagent for each fact adds 2–3 round-trips per task and 40% latency. **Solution:** give the synthesis agent a scoped `verify_fact` tool for simple lookups; keep complex verification routed through the coordinator.

**How it differs from violating least-privilege.** Least-privilege (Module 3.2) says "smallest set the agent needs." This pattern says "smallest set that *handles the 85% common case efficiently*; route the 15% complex through the coordinator." Both principles in tension; resolve by **scoping the cross-role tool narrowly** rather than giving the broad version.

**Diagnostic shorthand.** *Frequent simple lookups causing N× latency through coordinator* → scoped cross-role tool for the common path, coordinator for complex.

---

### Δ3. Splitting generic tools into purpose-specific ones (Task 2.3, Skills)

**Pattern.** Replace generic / overloaded tools with **constrained, purpose-specific** alternatives:

| Generic (bad) | Constrained alternatives (good) |
|---|---|
| `fetch_url(url)` | `load_document(url)` — validates document URLs only |
| `analyze_document(doc)` | `extract_data_points(doc)`, `summarize_content(doc)`, `verify_claim_against_source(claim, doc)` |
| `process(payload)` | `process_refund(amount)`, `process_exchange(item_id)` |

**Why.** Generic tools force the model to *re-derive intent each call*; purpose-specific tools have clearer descriptions, clearer schemas, and pair better with `allowedTools` restrictions per subagent.

**Diagnostic shorthand.** *One tool does too many things; selection or schema is ambiguous* → split into purpose-specific tools with defined I/O contracts.

---

## Medium priority — covered but underweighted

### Δ4. Enhancing MCP descriptions to prevent built-in tool preference (Task 2.4)

Agents tend to default to built-in tools (`Grep`, `Glob`) over MCP tools that overlap in capability. **Defense:** MCP tool descriptions must explicitly explain *unique* capabilities and outputs the built-in cannot provide — *live production data, cross-system joins, freshness guarantees, structured schemas*. A description that just says "search the system" loses to `Grep`.

**Diagnostic shorthand.** *Agent uses Grep instead of your MCP tool* → strengthen the MCP description; name the data/freshness/context the built-in can't supply.

---

### Δ5. Test-driven iteration with Claude Code (Task 3.5)

The exam-tested workflow: **write test suites *first*** (expected behavior + edge cases + performance requirements), then iterate by **sharing test failures with Claude** to guide progressive improvement. This is the rigorous version of Module 5.5's "Iterative refinement" section.

The shape: *spec first (as runnable tests) → iterate implementation against those tests*. Same engineering principle as Module 6.5's retry-with-feedback, applied to code generation rather than data extraction.

**Diagnostic shorthand.** *Complex Claude Code implementation that needs refinement* → tests first + share failures + interview pattern for ambiguity.

---

### Δ6. `detected_pattern` field for false-positive analysis (Task 4.4)

Instrument structured review findings with a `detected_pattern` field naming **which code construct** triggered the finding. This enables systematic downstream analysis: *"Which patterns generate the most dismissals?" → "That category has a false-positive problem; rework the criteria."*

Self-instrumenting reviews. Pairs with the *temporarily-disable-high-FP-categories* operational pattern (Δ11).

**Diagnostic shorthand.** *Want to learn which rule categories generate false positives* → add `detected_pattern` field to findings, analyze dismissal rates by pattern.

---

### Δ7. Per-finding confidence scoring in code review (Task 4.6)

Distinct from the per-field confidence scoring in *extraction* (Module 9.4). In a code-review task, the model **self-reports a confidence number alongside each finding**. The review pipeline then routes high-confidence findings to auto-fix / direct posting, and low-confidence to human review.

**Diagnostic shorthand.** *Code-review bot's findings are unevenly trustworthy* → add per-finding confidence; route by threshold.

---

### Δ8. Stratified random sampling for accuracy validation (Task 5.5)

**The trap.** Aggregate 97% accuracy across a corpus can mask 40%+ errors on a specific document type or field. *"97% overall accuracy"* on a stratified mix may be 99% on common forms and 60% on rare ones — the average hides the cliff.

**Fix.** Sample stratified by document type AND by field segment before declaring an extraction pipeline safe to automate. Periodically re-sample high-confidence extractions to detect novel error patterns.

**Diagnostic shorthand.** *Aggregate metric looks great, but rare doc type fails* → stratified sampling by type and field.

---

## Lower priority — smaller nuances worth filing

### Δ9. `/memory` as a diagnostic tool (Task 3.1)

`/memory` isn't just for editing CLAUDE.md. The official guide explicitly lists it as a **diagnostic command** to verify *which memory files are currently loaded* and diagnose "inconsistent behavior across sessions." If a teammate's session is behaving differently than yours, `/memory` shows the actual loaded set.

---

### Δ10. All-issues-at-once vs sequentially (Task 3.5)

When multiple fixes **interact** (changing X affects Y), batch them in **one** message so the model can reason about the joint constraints. When fixes are **independent**, fix them **sequentially** for focus. Subtle but tested as a Domain-3 skill.

---

### Δ11. Temporarily disabling high-FP rule categories (Task 4.1)

When a single rule category generates excessive false positives, **disable that category** while you improve its prompt — rather than letting the bad output erode developer trust in *all* rule categories (including the accurate ones). Operational triage move.

---

### Δ12. Prompt refinement on a sample set before batch processing (Task 4.5)

Before submitting 10k documents to the Batches API, **tune the prompt on a small sample** (10–100 docs) to maximize first-pass success rates. Otherwise you discover failure modes only after paying for the full batch and have to resubmit. Cost-conscious workflow.

---

### Δ13. Rendering by content type in synthesis (Task 5.6)

Don't force all synthesized output into one format. **Financial data → tables. News → prose. Technical findings → structured lists. Time series → chronological order.** We have this in Module 12.4 revision; the official guide reinforces it as an explicit Domain-5 skill.

---

## Quick cheatsheet — symptom → delta number

| Symptom | Delta |
|---|---|
| "Agent skips required prerequisite tool; financial consequences" | Δ1 |
| "Round-trips through coordinator make latency unacceptable for common case" | Δ2 |
| "One generic tool does too much; descriptions blur" | Δ3 |
| "Agent prefers Grep over our richer MCP tool" | Δ4 |
| "How to refine a complex Claude Code implementation" | Δ5 |
| "Need to learn which rule categories generate false positives" | Δ6 |
| "Code-review findings are unevenly trustworthy" | Δ7 |
| "97% aggregate accuracy but rare doc type fails" | Δ8 |
| "Teammate's session behaves differently than mine" | Δ9 |
| "Multiple fixes that interact" | Δ10 |
| "One rule category's false positives undermine all rule trust" | Δ11 |
| "About to batch-process 10k docs" | Δ12 |
| "Synthesis is one wall of prose mixing numbers, narrative, and lists" | Δ13 |
