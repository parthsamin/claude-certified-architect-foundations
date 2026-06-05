# Product Manager's Cheat Sheet — Building, Thinking About, and Managing AI Agents with Claude

A scannable, decision-focused reference for PMs scoping, prioritizing, and shipping
Claude-based agent features. You don't need to write code to use this — but every
concept links to a 2-minute runnable demo in this lab (`npm run mN:slug`) and a
deeper revision note, so you can see any idea in action or hand an engineer the
exact reference.

> **House rule that pays off everywhere:** *specificity beats vagueness, and the
> model reasons over exactly what you put in front of it.* Most "the AI is
> unreliable" problems are really scoping, tooling, or guardrail problems — all of
> which are PM-shaped decisions.

> ⚠️ **Pricing changes — always re-check before quoting.** All dollar figures in
> this doc are a point-in-time snapshot **as of 2026-06-05** and *will* drift as
> Anthropic updates pricing and ships new models. Treat them as illustrative, not
> authoritative: confirm live numbers at
> [platform.claude.com/pricing](https://platform.claude.com/docs/en/pricing) (and
> the [models overview](https://platform.claude.com/docs/en/about-claude/models/overview))
> before putting any figure in a business case.

---

## 1. The one mental model: agent = a loop the model drives

An **agent** is a loop: the model is given a goal and some tools, it decides the
next action, your code runs it, the result goes back, repeat — until the model
says it's done. That's it. Everything else (subagents, MCP, hooks) is structure
around that loop.

The key distinction you'll make constantly:

| | **Workflow** | **Agent** |
|---|---|---|
| Who decides the steps | **Your code** (fixed pipeline) | **The model** (per-step) |
| Predictability | High — same path every run | Lower — adapts to the situation |
| Best when | Steps are known in advance | Steps depend on what's found at runtime |
| Cost/latency | Lower, bounded | Higher, variable |
| Demo | `npm run m6:chain` | `npm run m3:coord` |

**Rule of thumb:** reach for a workflow first. Use an agent only when the task is
genuinely open-ended. ([Module 8 — decomposition](../revision/module-08-decomposition.md))

---

## 2. Decision framework A — what shape does the task need?

Go down this list and **stop at the first one that works**. Each tier is cheaper,
faster, and more predictable than the next.

| Tier | Use when | Example | Demo |
|---|---|---|---|
| **Single prompt** | One input → one output, no external data | Classify a ticket; summarize a doc | `npm run m1:hello` |
| **Prompt + structured output** | You need machine-readable fields back | Extract `{name, amount, date}` from an email | `npm run m2:schema` |
| **Prompt chain (workflow)** | Fixed multi-step, each step feeds the next | Analyze file A → file B → integrate | `npm run m6:chain` |
| **Single agent + tools** | Model must look things up / act, steps not known upfront | "Answer using our order DB" | `npm run m3:def` |
| **Multi-agent (coordinator + subagents)** | Independent sub-tasks, or context too big for one agent | Research 3 topics in parallel, then synthesize | `npm run capstone` |

**Don't reach for an agent when:**
- The task is fully specifiable as fixed steps → use a workflow (cheaper, predictable).
- A wrong answer is expensive *and* hard to catch → add human-in-the-loop first (§6).
- You only need data transformed → a single structured-output call is enough.
- Latency is critical and the task is simple → single call; agents add round-trips.

**The 4-question gate before committing to "agent":** is it (1) genuinely
**complex**/hard to fully specify, (2) **valuable** enough to justify higher cost &
latency, (3) **viable** (is Claude good at this task), (4) **recoverable** (can you
catch & undo errors)? A "no" on any → drop a tier.

---

## 3. Decision framework B — which Claude surface do we build on?

These are four different *products*, not just code styles. Picking right saves
months. (The lab demonstrates the first three; the exam names all four.)

| Surface | Who runs the loop | Who hosts compute | Best for | In this lab |
|---|---|---|---|---|
| **Claude API** (single calls) | N/A | You | Classification, extraction, summarization, Q&A, **batch jobs** | `npm run m1:*`, `m7:batches` |
| **Client SDK + your tool loop** | **You** write it | You | Custom workflows/agents where you want full control of the loop & tools | `agent.js`, `npm run m3:*` |
| **Agent SDK** (`@anthropic-ai/claude-agent-sdk`) | **Claude** | You | Production agents with built-in tools, subagents, hooks, sessions — without hand-rolling the loop | `npm run m3:sdk`, `capstone:sdk` |
| **Managed Agents** | Claude | **Anthropic** (hosted sandbox) | Stateful, long-running agents with a workspace, when you don't want to run sandbox/session infra | (exam topic; not in lab) |
| **Claude Code (CLI/IDE)** | Claude | Local/your CI | Dev-time coding workflows, CI automation | [Module 5](../revision/module-05-claude-code.md) |

**One-liner:** *Client SDK = you write the loop. Agent SDK = Claude runs the loop.
Managed Agents = Anthropic runs the loop **and** the sandbox.* Full mapping:
[Client SDK vs Agent SDK](../revision/agent-sdk-vs-client-sdk.md).

**PM cost lens:** Client SDK / Agent SDK run on *your* infra (you pay hosting +
tokens). Managed Agents trades infra ownership for a hosted service. Start with
single API calls; graduate only when the task demands it.

---

## 4. Glossary — engineer-speak → plain English

Skim this before your next eng sync. Each term links to where the lab demos it.

| Term | What it means for you | Demo / ref |
|---|---|---|
| **Token** | The unit you pay for (~¾ of a word). Both input and output are billed. | [M1](../revision/module-01-api-fundamentals.md) |
| **Context window** | The model's working memory for one request (1M tokens on Opus/Sonnet 4.6). Everything — instructions, history, tool results — competes for it. | `npm run m1:context` |
| **Stateless API** | The model remembers nothing between calls; your app resends the conversation each time. "Memory" is something you build. | `npm run m1:roles` |
| **`stop_reason`** | Why the model stopped this turn (done / wants a tool / hit length limit). Drives the agent loop. | `npm run m1:stop` |
| **Tool / `tool_use`** | A function you let the model call (look up an order, issue a refund). The model picks; your code runs it. | `npm run m2:desc` |
| **`tool_choice`** | A dial: let the model decide / force it to use *a* tool / force *a specific* tool. | `npm run m2:choice` |
| **JSON Schema** | A contract for the shape of structured output. Guarantees *syntax*, not *truth* — a hallucinated value still validates. | `npm run m2:schema` |
| **MCP** (Model Context Protocol) | An open standard for plugging external systems (DBs, APIs) into the model as **tools** (verbs) and **resources** (reference data). | `npm run m4:mcp` |
| **Subagent / coordinator** | A "manager" agent that delegates to focused "worker" agents. Workers have **isolated context** — they only see what's passed to them. | `npm run m3:coord` |
| **Hook** | Deterministic code that runs before/after every tool call — to **block** or **transform** it. Your hard guardrail. | `npm run m3:hooks` |
| **System prompt** | The standing instructions/role. Wording is an architectural lever, not decoration. | `npm run m1:system` |
| **Few-shot** | Teaching by examples in the prompt — locks in conventions a schema can't express. | `npm run m6:classify` |
| **RAG / retrieval** | Fetching relevant docs and putting them in the prompt so the model answers from your data, not just training. | [M4](../revision/module-04-mcp.md) |
| **Batch (Batches API)** | Submit many requests asynchronously for **~50% off**; results within ~1h (max 24h). For anything where a human isn't waiting. | `npm run m7:batches` |
| **Prompt caching** | Reuse a stable prompt prefix across calls; cached tokens cost ~10% of normal. Big lever for repeated context. | [§7](#7-cost--latency-levers) |
| **Eval** | A test set that measures agent quality (success rate, etc.) so you can ship changes with confidence. | [§9](#9-metrics--kpis) |
| **Provenance** | Keeping source + date on every claim so outputs are auditable and conflicts become time-series, not noise. | `npm run m12:prov` |
| **Escalation / HITL** | Handing off to a human when the model is out of policy or confidence. | `npm run m9:escalate` |
| **Compaction / context mgmt** | Summarizing or trimming long histories so a session doesn't blow the context window. | [M11](../revision/module-11-context-mgmt.md) |

---

## 5. Reliability & guardrails — deterministic vs probabilistic

The single most important reliability idea: **a prompt is a request; a hook (or
withholding a tool) is a guarantee.**

| Layer | Mechanism | Guarantee | Use for |
|---|---|---|---|
| Probabilistic | System-prompt wording ("never refund over $500") | ~high, not 100% | Tone, preferences, formatting |
| Deterministic (config) | **Withhold the tool** — the agent literally can't call it | 100% | Capabilities a role must never have |
| Deterministic (runtime) | **Hook** gates/transforms each call in code | 100% | Financial, legal, safety, compliance rules |

**The rule to memorize:** *if a failure has financial / legal / safety
consequences, enforce it with a hook or by withholding the tool — never with a
prompt.* ([M3](../revision/module-03-agent-sdk.md) · `npm run m3:hooks`, `m3:def`)

Other reliability patterns worth funding:

- **Make absence representable.** Give schemas a nullable field or an `"unclear"`
  enum, or the model will invent values. (`npm run m2:schema`)
- **Validate + retry with feedback.** Schema (syntax) → validator (semantics) →
  feed errors back so the model corrects itself. (`npm run m2:errors`)
- **Never silently drop a failed sub-task.** Annotate coverage as `FULL`/`PARTIAL`
  so readers see what's reliable. (`npm run m10:coverage`)
- **Preserve provenance under conflict.** Keep both sources with dates instead of
  blending them into one confident-sounding number. (`npm run m12:prov`)
- **Escalate deliberately.** Define triggers (explicit request, policy gap, low
  confidence) and produce a self-contained handoff. (`npm run m9:escalate`)
- **Persist state for recovery.** Long jobs should checkpoint so a crash resumes
  instead of restarting. (`npm run m11:state`)

---

## 6. Human-in-the-loop — when to keep a person in the path

| Situation | Default posture |
|---|---|
| Irreversible or high-cost action (refunds, deletes, sends, payments) | Gate behind confirmation **and** a hook |
| Policy gap / no clear rule | Escalate to a human with context |
| Low model confidence or repeated failure | Escalate, don't retry forever |
| Routine, reversible, well-specified | Automate fully |

A good handoff is **self-contained** — the operator should not have to read the
whole transcript. (`npm run m9:escalate` · [M9](../revision/module-09-escalation.md))

---

## 7. Cost & latency levers

The four biggest levers, roughly in order of impact:

| Lever | What it does | When to pull it |
|---|---|---|
| **Model tier** | Capability vs cost vs speed (table below) | Use the smallest model that passes your eval |
| **Batches API** | ~**50% off**, async (≤24h) | Any job where a human isn't waiting (overnight classification, backfills, evals) |
| **Prompt caching** | Cached prefix ≈ 10% of input cost | Repeated large context (system prompt, knowledge base, few-shot) |
| **Trim & scope** | Fewer tokens per call; fewer tool round-trips | Trim fat tool results; give each agent only the tools it needs; parallelize independent work |

**Model selection (snapshot as of 2026-06-05 — prices change; verify at
[platform.claude.com/pricing](https://platform.claude.com/docs/en/pricing) before quoting):**

| Model | ID | Context | Input $/1M | Output $/1M | Reach for it when |
|---|---|---|---|---|---|
| **Opus 4.8** | `claude-opus-4-8` | 1M | $5 | $25 | Hardest reasoning, long-horizon agents, top quality |
| **Sonnet 4.6** | `claude-sonnet-4-6` | 1M | $3 | $15 | Best speed/intelligence balance — the workhorse default |
| **Haiku 4.5** | `claude-haiku-4-5` | 200K | $1 | $5 | High volume, simple/fast tasks, cheap subagents |

Notes that matter for a budget:
- **Output tokens cost ~5× input** — verbose responses are where spend hides.
- **Batch = ½ price.** "Synchronous if a human is waiting; batch for everything
  else." (`npm run m7:batches`)
- **Caching** has a ~25% write surcharge on first use, then ~10% reads — it pays
  off after about 2 reuses; TTL is 5 min (default) or 1 hour. Keep the cached
  prefix byte-stable (no timestamps/IDs up front) or it silently misses.
- **Mixed-model agents:** run the coordinator on Sonnet/Opus and cheap subagents
  on Haiku. (`npm run m1:context` shows token waste; `m3:task` shows parallelism.)

---

## 8. Quality levers (prompting, no code changes)

Cheap, fast wins that operate purely on how the prompt is written:

| Lever | Effect | Demo |
|---|---|---|
| **Tool descriptions** | The model's #1 signal for picking the right tool — more than names | `npm run m2:desc` |
| **Few-shot examples** | Lock in team-specific conventions a schema can't encode (e.g. your P0/P1 routing) | `npm run m6:classify` |
| **Prompt chaining** | Fixes "attention dilution" on multi-input tasks | `npm run m6:chain` |
| **Self-correction** | Model extracts stated *and* computed values, flags conflicts | `npm run m6:correct` |
| **System-prompt scoping** | "ALWAYS verify" vs "only when needed" measurably changes behavior | `npm run m1:system` |

Pair with **evals** (§9) so you can tell whether a prompt change actually helped.

---

## 9. Metrics & KPIs for an agent product

What to put on the dashboard. Set targets per use case, then track regressions.

| Metric | Definition | Why it matters | Target hint |
|---|---|---|---|
| **Task success rate** | % of runs that achieve the goal (graded by eval or human) | The headline quality number | Set a bar per use case; gate releases on it |
| **Escalation rate** | % of runs handed to a human | Too high = automation isn't working; too low = unsafe over-automation | Tune toward your risk tolerance |
| **Deflection / containment** | % fully resolved without a human | Direct ROI for support-style agents | Trend up without success-rate drop |
| **Tool-call accuracy** | % of tool calls that were the right tool + right args | Localizes failures to tooling vs reasoning | High; investigate dips per tool |
| **Cost per task** | tokens × price (÷2 if batched) per completed task | Unit economics | Must beat the manual baseline |
| **Latency (p50 / p95)** | Time to result; watch the tail | UX and SLA; agents add round-trips | Set p95 SLA per surface |
| **Retry / loop rate** | Avg model round-trips per task | Catches runaway loops and prompt issues | Low and stable |
| **Coverage / provenance completeness** | % of outputs with required sections & sourced claims | Trust and auditability | ~100% for regulated/decision use |

**Rule:** you can't manage what you don't eval. Stand up a small labeled test set
early; it's what lets you ship prompt/model changes without guessing.

---

## 10. Lifecycle / maturity model

Most teams climb these rungs. Don't skip straight to "production" — each stage
adds a specific safeguard.

| Stage | Goal | What to add | Lab analog |
|---|---|---|---|
| **1. Prototype** | Prove the task is viable | Single prompts / a simple loop; eyeball outputs | `npm run m1:loop` |
| **2. Structured & evaluated** | Make output reliable & measurable | JSON schema + validator; a labeled eval set | `m2:schema`, `m2:errors` |
| **3. Guardrailed** | Make it safe | Hooks for money/safety; withhold dangerous tools; least privilege | `m3:hooks`, `m3:def` |
| **4. Human-in-the-loop** | Handle the long tail | Escalation triggers + structured handoff | `m9:escalate` |
| **5. Production-hardened** | Run at scale, recover from failure | State persistence, coverage annotations, provenance, observability, cost controls (batch/cache) | capstone (`npm run capstone`) |

---

## 11. PM scoping checklist — questions to ask engineering

Bring these to design review for any agent feature:

- [ ] **Surface:** single call, workflow, or agent? Which framework (§3)? Why not a cheaper tier?
- [ ] **Tools:** exactly which tools does the agent get? (Least privilege — withhold the rest.)
- [ ] **Hard guardrails:** which rules are enforced by a **hook**, not a prompt? (All money/legal/safety ones.)
- [ ] **Failure modes:** what happens when a tool errors or a sub-task fails? Is it surfaced, not swallowed?
- [ ] **Escalation:** what triggers a human handoff, and what does the operator receive?
- [ ] **Success definition:** how is "done/correct" measured? Is there an eval set?
- [ ] **Cost ceiling:** target cost & latency per task? Can it batch? Can context be cached?
- [ ] **Provenance:** do outputs need sources/dates for audit or compliance?
- [ ] **Recovery:** if it crashes mid-run, does it resume or restart?
- [ ] **Model choice:** smallest model that passes eval? Mixed tiers for subagents?

---

## 12. Strategic traps (symptom → cause → fix)

The PM-level version of the lab's per-module "exam traps."

| Symptom | Likely cause | Fix |
|---|---|---|
| "It issues refunds over the limit despite the prompt" | A guardrail was written as a prompt | Enforce with a **hook** or withhold the tool (§5) |
| "It occasionally uses a tool it never should" | Relying on prompt instructions for privilege | **Withhold** the tool from that agent (least privilege) |
| "The report is missing data a researcher found" | Coordinator didn't pass it to the next agent | Explicit context passing — subagents are isolated |
| "Two sources disagree and the number looks made up" | Sources blended without attribution | Preserve provenance + dates; keep both (`m12:prov`) |
| "A failed step just vanished from the output" | Silent drop of a partial failure | Coverage annotations `FULL`/`PARTIAL` (`m10:coverage`) |
| "Our bulk job is burning budget/time" | Using the synchronous API for non-urgent volume | Move to the **Batches API** (~50% off) |
| "One giant prompt gives shallow answers" | Attention dilution across many inputs | Decompose into a chain or multi-pass (`m8:passes`) |
| "It hallucinated an ID/field" | Required field with no way to say "unknown" | Make absence representable (nullable / `"unclear"`) |
| "It loops forever / costs spike" | No iteration cap or wrong stop signal | Cap iterations (throw, don't silently "succeed"); branch on `stop_reason` |
| "Quality regressed after a prompt tweak" | No eval to catch it | Stand up an eval set; gate changes on it (§9) |

---

## 13. Concept → lab demo map

Hand this to an engineer (or run it yourself) to see any concept live.

| PM topic | Module / ref | Run it |
|---|---|---|
| API basics, statelessness, context cost | [M1](../revision/module-01-api-fundamentals.md) | `npm run m1:hello` · `m1:context` |
| Tools, tool_choice, schema, validation | [M2](../revision/module-02-tools.md) | `npm run m2:desc` · `m2:schema` · `m2:errors` |
| Agents, least privilege, hub-and-spoke, hooks | [M3](../revision/module-03-agent-sdk.md) | `npm run m3:coord` · `m3:hooks` |
| Real Agent SDK (`query()`) | [Client vs Agent SDK](../revision/agent-sdk-vs-client-sdk.md) | `npm run m3:sdk` |
| MCP: external systems as tools/resources | [M4](../revision/module-04-mcp.md) | `npm run m4:mcp` · `m4:resources` |
| Claude Code config & CI | [M5](../revision/module-05-claude-code.md) | (config files) |
| Prompt engineering | [M6](../revision/module-06-prompt-engineering.md) | `npm run m6:classify` · `m6:chain` |
| Batches (cost) | [M7](../revision/module-07-batches.md) | `npm run m7:batches` |
| Task decomposition | [M8](../revision/module-08-decomposition.md) | `npm run m8:passes` |
| Escalation / HITL | [M9](../revision/module-09-escalation.md) | `npm run m9:escalate` |
| Error handling / coverage | [M10](../revision/module-10-error-handling.md) | `npm run m10:coverage` |
| Context mgmt / recovery | [M11](../revision/module-11-context-mgmt.md) | `npm run m11:state` |
| Provenance | [M12](../revision/module-12-provenance.md) | `npm run m12:prov` |
| Full multi-agent system, end to end | [Capstone](../src/capstone/README.md) | `npm run capstone` · `capstone:sdk` |

---

*This sheet distills the 13 lab modules into product decisions. For the hands-on
engineering depth behind any row, follow its link. For exam-domain weighting and
deeper recaps, see the [revision index](../revision/README.md).*
