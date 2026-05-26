# Module 3 — Claude Agent SDK & Agentic Loops

> Exam relevance: Domain 1 (Agent Architecture & Orchestration, **27%** — biggest slice). Almost every Domain 1 question lives in this module.

---

## 3.1 The Agentic Loop, Formalized

An agent = a `while` loop around the Messages API, branching on `stop_reason`. The Claude Agent SDK is that loop reused as `agent.run(prompt)`.

Decision-making is **model-driven**, not a hard-coded decision tree — the model picks the next action each iteration.

**Anti-patterns (do NOT use as completion signals):**

- Parsing assistant text for "task complete" / "done".
- `max_iterations` as the *primary* stop condition.
- Treating "any textual content" as completion (text can co-exist with `tool_use`).

**Only reliable completion signal:** `stop_reason === "end_turn"`.

A `max_iterations` cap is fine as a **safety net** — but when it trips it must **throw/error**, never return success silently.

---

## 3.2 `AgentDefinition` Configuration

Four knobs per agent:

| Knob | Role |
|---|---|
| `name` | Identifier — logs, routing |
| `description` | Purpose — used by coordinators to delegate (analogous to a tool description) |
| `systemPrompt` | Role / constraints / output format (Module 1.5 rules apply) |
| `allowedTools` | **Principle of least privilege** — smallest tool set the agent needs |

**Withholding a tool is deterministic; instructing the model not to use it is probabilistic.** A tier-1 agent that should never refund money simply isn't given `process_refund`.

---

## 3.3 Hub-and-Spoke (Coordinator + Subagents)

A multi-agent system is a **topology**: one **coordinator** at the hub, **subagents** as spokes. Every piece of work and every result flows through the hub.

**Coordinator responsibilities (six verbs, memorize):**

1. **Decompose** the task into subtasks.
2. **Decide** which subagents are needed (dynamic — model-driven).
3. **Delegate** with the exact context each subagent needs.
4. **Aggregate** subagent results.
5. **Validate** them (sanity-check, cross-check).
6. **Communicate** one synthesized answer back to the user.

**Subagent properties:**

- Narrow, focused, single-purpose.
- Own `systemPrompt` and own `allowedTools` (least privilege per subagent).
- Runs its own agent loop on its slice of the work.
- Returns one result.

**Critical principle (exam-tested):** **Subagents have isolated context.**

- They do NOT inherit the coordinator's conversation.
- They do NOT share memory across calls.
- All required context must be **explicitly passed in the subagent's prompt**.
- All communication routes through the coordinator (no peer-to-peer).

**Why the topology exists:**

| Reason | What it buys |
|---|---|
| Observability | One place to log every delegation + result |
| Error control | Coordinator decides what to do when a subagent fails |
| Synthesis | Exactly one component reasons across all results |
| Context hygiene | Subagent A doesn't pollute B's window |

---

## 3.4 The `Task` Tool, Context Passing, Parallel Spawning

The SDK's canonical implementation of hub-and-spoke. The coordinator's `allowed_tools` includes `"Task"` (literal name). One polymorphic tool, many spokes.

```
Task({ subagent_type: "researcher", prompt: "..." })
```

`subagent_type` is constrained by an `enum` so the model can only emit registered identifiers — dispatch is by exact string match. Free-text routing is fragile.

**Explicit context passing — mandatory:**

| | |
|---|---|
| Bad | `Task("researcher", "Analyze the document")` — no document, no source, nothing |
| Good | `Task("researcher", "Analyze the following document. Document: <full text>. Prior search results: <results>. Output format: <schema>")` |

**Parallel spawning:** a single coordinator assistant turn can contain **multiple `tool_use` blocks**. When all are Task calls, subagents run **concurrently** (`Promise.all` in your loop). Use whenever subtasks are independent.

**Parallel is opportunistic, not automatic** — the model decides whether to fan out. Push it with a system-prompt instruction ("for comparisons, issue one Task per topic in your first turn") or take it out of the model's hands by orchestrating in code (fixed pipelines — Module 8).

**The handoff back:** subagent's `end_turn` text becomes the `content` of a `tool_result` paired by `tool_use_id`. On the coordinator's next iteration, it sees all results in its context and reasons over them.

---

## 3.5 Hooks (Deterministic Interception)

Hooks run on every tool call, in your code, **deterministically**.

| Hook | When it runs | Use for |
|---|---|---|
| `PreToolUse` | Before the handler | **Block / redirect** — policy enforcement (refunds > $500, deletions of prod, PII writes) |
| `PostToolUse` | After the handler, before the model sees the result | **Normalize / trim / redact** — date formats, currency, drop bloat, redact PII |

**The exam comparison (memorize):**

| Attribute | Hooks | Prompt instructions |
|---|---|---|
| Guarantee | **Deterministic (100%)** | **Probabilistic (>90%)** |
| When to use | Critical business rules, financial, safety, compliance | General preferences, formatting |
| Example | "Block refunds > $500" | "Try to solve before escalating" |

**Rule:** when failure has **financial / legal / safety** consequences → use a hook, not a prompt.

---

## Three layers of enforcement (use in combination)

| Layer | Mechanism | Guarantee |
|---|---|---|
| Probabilistic | System prompt wording | ~95% |
| Deterministic, config-time | `allowedTools` — withhold the tool entirely | 100% |
| Deterministic, runtime | `PreToolUse` hook — gate / transform each call | 100% |

---

## Exam traps — Module 3

- "Agent stops after one tool call" → loop is an `if`, not a `while` (Module 1 too).
- "Agent silently 'finishes' incomplete tasks" → `max_iterations` was treated as a completion signal; correct = throw on exhaustion.
- "Coordinator's synthesis is missing data the researcher found" → coordinator didn't include the research output in the writer's Task prompt. Isolated context bit you — explicit context passing.
- "Three independent subagent calls take 3× the latency they should" → coordinator issued them in separate turns; fix = fan out in **one** assistant turn so they parallelize.
- "Agent issues refunds over the limit despite the prompt forbidding it" → use a `PreToolUse` hook on `process_refund`. Tightening the prompt is the wrong answer.
- "Tier-1 agent occasionally calls a destructive tool despite system-prompt 'never use this'" → remove the tool from `allowedTools`. Withholding > instructing.
- "Two MCP tools return dates differently and agent reasoning is unreliable" → `PostToolUse` hook normalizing to ISO 8601.
- "Coordinator skips delegation and answers from prior knowledge" → soft system-prompt wording ("when needed"); scope it ("ALWAYS call ask_researcher first") or restructure as a code-orchestrated fixed pipeline.
