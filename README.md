# Claude Architect Lab

Hands-on training repo for the **Claude Certified Architect — Foundations** certification.

One module at a time. Each module has a short theory briefing, a set of runnable coding exercises, and a quick quiz. By the end, the `src/` tree becomes a working multi-agent research network.

## Prerequisites

- Node.js 18+ (uses native `fetch` and ES modules)
- npm
- An Anthropic API key — get one at <https://console.anthropic.com>

## One-time setup

```bash
cd claude-architect-lab
npm install
cp .env.example .env       # then paste your real ANTHROPIC_API_KEY into .env
```

## Modules

| #   | Module                                 | Exam domain |
| --- | -------------------------------------- | ----------- |
| 1   | Claude API Fundamentals                | Foundations |
| 2   | Tools and tool_use                     | D2 / D4     |
| 3   | Agent SDK and Agentic Loops            | D1          |
| 4   | Model Context Protocol (MCP)           | D2          |
| 5   | Claude Code Configuration              | D3          |
| 6   | Prompt Engineering                     | D4          |
| 7   | Message Batches API                    | D4          |
| 8   | Task Decomposition                     | D1          |
| 9   | Escalation & Human-in-the-Loop         | D5          |
| 10  | Error Handling in Multi-Agent Systems  | D5          |
| 11  | Context Management                     | D5          |
| 12  | Preserving Provenance                  | D5          |
| 13  | Claude Code Built-in Tools             | D2 / D3     |
| —   | Capstone: Multi-Agent Research Network | All         |

---

## Module 1 — Claude API Fundamentals

Build a mental model of the raw Claude API: how a request is shaped, why the API is stateless, how `stop_reason` drives every agent loop, and how the context window fills up. After this module you can write a minimal agent loop from scratch without an SDK.

### `npm run m1:hello`

Request/response shape and API statelessness — every call is independent.
_What you'll observe:_ the full response object, the text at `content[0].text`, `stop_reason: "end_turn"`, and a token-usage breakdown.

### `npm run m1:roles`

The `messages` array is the only state carrier — conversation lives entirely in what you pass back.
_What you'll observe:_ two parallel runs — one that passes the prior turns recalls a fact ("favorite number is 7"); the one without history has total amnesia.

### `npm run m1:stop`

The four `stop_reason` values and why your loop must branch on them.
_What you'll observe:_ four labeled responses — `end_turn` (clean), `max_tokens` (mid-word cutoff), `stop_sequence` (text ends before the sentinel), and a noted-but-not-triggered `tool_use` (covered in Module 2).

### `npm run m1:loop`

The agentic loop in ~30 lines: call → check `stop_reason` → run tools → feed results back as a user-role `tool_result`.
_What you'll observe:_ "API trip 1 / trip 2" prints — a tool-requiring question loops twice, a plain question exits in one trip.

### `npm run m1:system`

System-prompt wording subtly biases tool-selection — phrasing is an architectural lever.
_What you'll observe:_ the same question under "ALWAYS verify" vs "ONLY when needed" prompts; the pushy prompt over-calls `get_customer`, the scoped prompt skips it.

### `npm run m1:context`

Context-window bloat from un-trimmed tool results — every wasted token rides along on the next trip.
_What you'll observe:_ the same agent run with a fat 40-field tool result vs a trimmed 5-field one; final-trip `input_tokens` printed for each, and the delta is the measured waste.

### Key takeaways

- The API is stateless; the `messages` array is the entire conversation state.
- `stop_reason` is the loop's branching signal — every agent loop is built around it.
- A minimal agent is just: API call → branch on `stop_reason` → run tools → repeat.
- System-prompt wording is an architectural lever, not decoration — it biases tool selection.
- Every token in the request counts; trimming tool results before adding them to history is a measurable win.

---

## Module 2 — Tools and `tool_use`

Move from "agent can call tools" to "agent calls the _right_ tool with the _right_ arguments and recovers when something goes wrong." Covers description-as-signal, the `tool_choice` dial, JSON Schema as structured output, and the three-layer error-defense pattern.

### `npm run m2:desc`

Tool descriptions are the model's primary selection signal — far more than tool names.
_What you'll observe:_ same tool names + same schema, run with vague vs detailed descriptions across 3 questions × 3 trials. Vague set is unstable (different pick each trial); detailed set picks consistently.

### `npm run m2:choice`

`tool_choice` is a guarantee dial: `auto` (model decides), `any` (must call some tool), `tool` (must call this specific tool).
_What you'll observe:_ "Just say hi" under each mode — `auto` replies in text, `any` forces a pointless tool call, and a specific `tool` choice shoehorns the chat into that tool.

### `npm run m2:schema`

Marking schema fields as `required` forces the model to fabricate values when the source data doesn't contain them.
_What you'll observe:_ same support ticket extracted twice — a BAD schema invents an account ID like `ACC-12345`; a GOOD schema (nullable fields + an `"unclear"` enum) returns `null` and flags low confidence.

### `npm run m2:errors`

Three-layer defense for structured output: schema (syntax), validator (semantics), retry loop (feedback).
_What you'll observe:_ invoice extraction across attempts — attempt 1 has a wrong total, the validator catches the mismatch, the error is fed back as a `tool_result` with `is_error: true`, and attempt 2 corrects itself.

### Key takeaways

- Tool descriptions matter more than tool names — they're the model's strongest selection signal.
- `tool_choice` is a guarantee dial: trade flexibility (`auto`) for determinism (`tool`).
- JSON Schema guarantees syntax, not semantics — hallucinated values still validate.
- Make absence representable (nullable fields, an `"unclear"` enum value) or the model will invent.
- Robust extraction needs schema + a separate semantic validator + a retry loop that feeds errors back.

---

## Module 3 — Agent SDK and Agentic Loops

Formalize the hand-rolled loop into a reusable `Agent` abstraction, then compose multiple agents into a hub-and-spoke system: a coordinator that decomposes work, delegates to subagents via a `Task` tool, parallelizes independent work, and gates dangerous tool calls with deterministic hooks. By the end you have the building blocks of the capstone.

### `npm run m3:loop`

The agentic loop, formalized. The only reliable completion signal is `stop_reason === "end_turn"`; iteration caps must throw, not silently "finish".
_What you'll observe:_ two agents built from the same `Agent` class — `support` (uses a tool, runs 2 iterations) and `math` (no tools, exits in 1). Both terminate on `end_turn`.

### `npm run m3:def`

`AgentDefinition` — `name`, `description`, `systemPrompt`, `allowedTools`. Principle of least privilege.
_What you'll observe:_ same refund request sent to a `tier1_lookup` agent (no refund tool) and a `refund_specialist` (has the tool). Only the specialist's request hits the server-side `refundLog`. The tier-1 agent's failure is structural, not based on instructions.

### `npm run m3:coord`

Hub-and-spoke topology. A coordinator delegates to researcher and writer subagents via per-subagent dispatch tools.
_What you'll observe:_ `[coordinator -> researcher]` and `[coordinator -> writer]` log lines; each subagent runs its own loop with a fresh (isolated) context window built only from what the coordinator passed.

### `npm run m3:task`

The polymorphic `Task` tool with `subagent_type` + `prompt`. Subagent_type is an enum for deterministic dispatch. Multiple `tool_use` blocks in one assistant turn fan out via `Promise.all` (parallel spawning) — but only if the coordinator chooses to issue them in one turn.
_What you'll observe:_ timestamped `Task -> X START/DONE` lines. Whether they overlap (parallel) or chain (sequential) depends on how the coordinator decomposed the task — a teaching moment either way.

### `npm run m3:hooks`

Deterministic interception: `PreToolUse` to block, `PostToolUse` to normalize/redact.
_What you'll observe:_ a refund agent asked to issue $199 (allowed) and $999 (blocked by hook). The server-side `refundLog` shows only the $199 — the $999 was blocked in code before the handler ran. Date strings returned by `lookup_order` are normalized to ISO 8601 by the post-hook.

### Key takeaways

- An agent is a `while` loop around the Messages API; the SDK packages that as `agent.run(prompt)`. The only reliable completion signal is `stop_reason === "end_turn"`.
- `allowedTools` is **deterministic** privilege control; a system prompt forbidding a tool is **probabilistic**. Withhold the tool, don't trust the prompt.
- Hub-and-spoke: coordinator decomposes → decides → delegates → aggregates → validates → communicates. Subagents have **isolated context** — what the coordinator doesn't pass, the subagent can't see.
- The `Task` tool is the polymorphic delegation primitive. Parallel spawning happens when the coordinator emits multiple `tool_use` blocks in one assistant turn — opportunistic, not automatic.
- Hooks (`PreToolUse` / `PostToolUse`) are deterministic enforcement. For any financial / legal / safety guardrail, use a hook — not a prompt.

---

## Module 4 — Model Context Protocol (MCP)

Plug external systems into the agent through an open protocol. Build a real MCP server, configure it via `.mcp.json`, glue MCP tools into the Module-3 `Agent` class, design structured errors, and use the resources primitive to give the agent a "map" of available data before it makes any tool calls.

### `npm run m4:mcp`

A real MCP server (`server.js`) publishing one tool, a client that spawns it over stdio, discovers the tools, and invokes one — plus a bogus-ID call to preview `isError`.

### `npm run m4:config`

A `.mcp.json`-style config with env-var interpolation. The loader spawns every configured server (skipping any whose required env var is unset) and prints the effective union of discovered tools.

### `npm run m4:agent`

The big merge: `mcp-host.js` translates MCP tool definitions into the `Agent` class's `toolCatalog` shape. An `Agent` answers a real-order question and a bogus-order question — the bogus one honestly says "not found" because `isError` propagated through the loop.

### `npm run m4:errors`

Two tools, same operation, two error shapes: structured (`errorCategory`, `isRetryable`, `message`, `attempted_query`, `partial_results`) vs generic ("Operation failed"). The agent reasoning under each shape is the lesson.

### `npm run m4:resources`

A server publishing **one tool + two resources** (orders catalog, orders schema). The catalog is pre-loaded into the agent's system prompt — Q1 ("which orders does Jane have?") is answered with zero tool calls; Q2 (one order's full details) still needs a tool call.

### Key takeaways

- MCP is an open protocol with three primitives: **tools** (verbs), **resources** (nouns), prompts (templates). Tools and resources are the ones the exam tests.
- `.mcp.json` (project, version-controlled) for team-shared servers; `~/.claude.json` (user home) for personal/experimental. Secrets via `${ENV_VAR}` references, never inline.
- Translation gotcha: MCP's `inputSchema` (camelCase) ↔ Anthropic API's `input_schema` (snake_case). Also unwrap the `{content:[{type:"text",text}]}` envelope before handing to the agent.
- Structured errors give the agent decision inputs (`errorCategory`, `isRetryable`, etc.); generic errors give nothing. *If your error response is a string, you designed it wrong.*
- Decision rule for tool vs resource: action / parameterized data → tool; static or structural context → resource. Reclassifying read-only "list/describe" tools as resources collapses tool counts and makes routing cleaner.

---

## Running an exercise

```bash
npm run <script>     # e.g. npm run m1:hello
```

Output goes to stdout. Each script reads `ANTHROPIC_API_KEY` from `.env` via `dotenv` — make sure your key is set before running.

## What's next

Modules 5–13 and the capstone are upcoming — each will land here with its own exercises and notes as the lab grows.

## Revision notes

Concept refreshers for each completed module — read these before re-running the exercises or sitting the exam.

- [Revision index](revision/README.md)
- [Module 1 — Claude API Fundamentals](revision/module-01-api-fundamentals.md)
- [Module 2 — Tools and `tool_use`](revision/module-02-tools.md)
- [Module 3 — Agent SDK and Agentic Loops](revision/module-03-agent-sdk.md)
- [Module 4 — Model Context Protocol (MCP)](revision/module-04-mcp.md)
