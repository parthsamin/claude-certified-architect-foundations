# Module 3 — Claude Agent SDK & Agentic Loops

> Exam relevance: Domain 1 (Agent Architecture & Orchestration, **27%** — biggest slice). Almost every Domain 1 question lives in this module.

> **Two SDKs — don't conflate them.** This module hand-rolls the agent loop on
> the **Client SDK** (`@anthropic-ai/sdk`, the Messages API client) so the
> mechanics are visible. The exam also names the real **Agent SDK**
> (`@anthropic-ai/claude-agent-sdk`), a *different* package that runs the loop
> for you via `query({prompt, options})`. The hand-rolled `Agent` class is the
> Client-SDK pattern; `npm run m3:sdk` shows the real Agent SDK. Full
> concept-by-concept mapping: [agent-sdk-vs-client-sdk.md](agent-sdk-vs-client-sdk.md).

---

## 3.1 The Agentic Loop, Formalized

An agent = a `while` loop around the Messages API, branching on `stop_reason`. With the **Client SDK** you write that loop yourself (this lab's `agent.run(prompt)`); the **Agent SDK** packages it as `query({prompt, options})` so Claude runs it for you.

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

> **Real Agent SDK shape differs.** Its `AgentDefinition` is `{ description, prompt, tools }` — `prompt` (not `systemPrompt`), `tools` (not `allowedTools`). And its `allowedTools` is an **auto-approve list**, not a hard filter: a tool left off still exists but needs permission (`permissionMode`) or a hook to gate it. The lab's `allowedTools` removes the tool outright. See the [mapping doc](agent-sdk-vs-client-sdk.md).

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

The lab's hand-rolled implementation of hub-and-spoke. The coordinator's `allowed_tools` includes `"Task"` (literal name). One polymorphic tool, many spokes.

```
Task({ subagent_type: "researcher", prompt: "..." })
```

`subagent_type` is constrained by an `enum` so the model can only emit registered identifiers — dispatch is by exact string match. Free-text routing is fragile.

> **Real Agent SDK does this differently.** You don't build a `Task` tool. You pass `options.agents: { "<name>": { description, prompt, tools } }` and add the built-in **`"Agent"`** tool to `allowedTools`; the SDK spawns subagents and surfaces them via `SubagentStart` / `SubagentStop` hooks. Same hub-and-spoke topology, different primitive — `m3:sdk` demonstrates it.

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

> **Real Agent SDK hooks** use a richer shape: `hooks: { PreToolUse: [{ matcher: "Bash", hooks: [cb] }] }`, and you block by returning `hookSpecificOutput.permissionDecision: "deny"` (vs the lab callback returning a value). Same deterministic-gate lesson — see the [mapping doc](agent-sdk-vs-client-sdk.md) and `m3:sdk`.

---

## 3.6 Sessions (Agent-SDK only)

The lab never persists agent state mid-loop; the closest coverage is the Claude Code CLI flags in [Module 5](module-05-claude-code.md) (`--resume`, `fork_session`). The real **Agent SDK** has this first-class: capture `session_id` from the init/`system` message, resume with `options.resume`, or fork to branch from shared context. Recognize it as an Agent-SDK capability, not a Client-SDK one.

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
