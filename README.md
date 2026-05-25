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

## Project structure

```
src/
├── module-01-api-fundamentals/
│   ├── 01-hello.js
│   ├── 02-message-roles.js
│   ├── 03-stop-reason.js
│   ├── 04-mini-loop.js
│   ├── 05-system-prompt.js
│   └── 06-context-window.js
└── module-02-tools/
    ├── 01-tool-descriptions.js
    ├── 02-tool-choice.js
    ├── 03-json-schema.js
    └── 04-errors.js
```

## Modules

| # | Module | Exam domain |
|---|--------|-------------|
| 1 | Claude API Fundamentals | Foundations |
| 2 | Tools and tool_use | D2 / D4 |
| 3 | Agent SDK and Agentic Loops | D1 |
| 4 | Model Context Protocol (MCP) | D2 |
| 5 | Claude Code Configuration | D3 |
| 6 | Prompt Engineering | D4 |
| 7 | Message Batches API | D4 |
| 8 | Task Decomposition | D1 |
| 9 | Escalation & Human-in-the-Loop | D5 |
| 10 | Error Handling in Multi-Agent Systems | D5 |
| 11 | Context Management | D5 |
| 12 | Preserving Provenance | D5 |
| 13 | Claude Code Built-in Tools | D2 / D3 |
| — | Capstone: Multi-Agent Research Network | All |

---

## Module 1 — Claude API Fundamentals

Build a mental model of the raw Claude API: how a request is shaped, why the API is stateless, how `stop_reason` drives every agent loop, and how the context window fills up. After this module you can write a minimal agent loop from scratch without an SDK.

### `npm run m1:hello`
Request/response shape and API statelessness — every call is independent.
*What you'll observe:* the full response object, the text at `content[0].text`, `stop_reason: "end_turn"`, and a token-usage breakdown.

### `npm run m1:roles`
The `messages` array is the only state carrier — conversation lives entirely in what you pass back.
*What you'll observe:* two parallel runs — one that passes the prior turns recalls a fact ("favorite number is 7"); the one without history has total amnesia.

### `npm run m1:stop`
The four `stop_reason` values and why your loop must branch on them.
*What you'll observe:* four labeled responses — `end_turn` (clean), `max_tokens` (mid-word cutoff), `stop_sequence` (text ends before the sentinel), and a noted-but-not-triggered `tool_use` (covered in Module 2).

### `npm run m1:loop`
The agentic loop in ~30 lines: call → check `stop_reason` → run tools → feed results back as a user-role `tool_result`.
*What you'll observe:* "API trip 1 / trip 2" prints — a tool-requiring question loops twice, a plain question exits in one trip.

### `npm run m1:system`
System-prompt wording subtly biases tool-selection — phrasing is an architectural lever.
*What you'll observe:* the same question under "ALWAYS verify" vs "ONLY when needed" prompts; the pushy prompt over-calls `get_customer`, the scoped prompt skips it.

### `npm run m1:context`
Context-window bloat from un-trimmed tool results — every wasted token rides along on the next trip.
*What you'll observe:* the same agent run with a fat 40-field tool result vs a trimmed 5-field one; final-trip `input_tokens` printed for each, and the delta is the measured waste.

### Key takeaways
- The API is stateless; the `messages` array is the entire conversation state.
- `stop_reason` is the loop's branching signal — every agent loop is built around it.
- A minimal agent is just: API call → branch on `stop_reason` → run tools → repeat.
- System-prompt wording is an architectural lever, not decoration — it biases tool selection.
- Every token in the request counts; trimming tool results before adding them to history is a measurable win.

---

## Module 2 — Tools and `tool_use`

Move from "agent can call tools" to "agent calls the *right* tool with the *right* arguments and recovers when something goes wrong." Covers description-as-signal, the `tool_choice` dial, JSON Schema as structured output, and the three-layer error-defense pattern.

### `npm run m2:desc`
Tool descriptions are the model's primary selection signal — far more than tool names.
*What you'll observe:* same tool names + same schema, run with vague vs detailed descriptions across 3 questions × 3 trials. Vague set is unstable (different pick each trial); detailed set picks consistently.

### `npm run m2:choice`
`tool_choice` is a guarantee dial: `auto` (model decides), `any` (must call some tool), `tool` (must call this specific tool).
*What you'll observe:* "Just say hi" under each mode — `auto` replies in text, `any` forces a pointless tool call, and a specific `tool` choice shoehorns the chat into that tool.

### `npm run m2:schema`
Marking schema fields as `required` forces the model to fabricate values when the source data doesn't contain them.
*What you'll observe:* same support ticket extracted twice — a BAD schema invents an account ID like `ACC-12345`; a GOOD schema (nullable fields + an `"unclear"` enum) returns `null` and flags low confidence.

### `npm run m2:errors`
Three-layer defense for structured output: schema (syntax), validator (semantics), retry loop (feedback).
*What you'll observe:* invoice extraction across attempts — attempt 1 has a wrong total, the validator catches the mismatch, the error is fed back as a `tool_result` with `is_error: true`, and attempt 2 corrects itself.

### Key takeaways
- Tool descriptions matter more than tool names — they're the model's strongest selection signal.
- `tool_choice` is a guarantee dial: trade flexibility (`auto`) for determinism (`tool`).
- JSON Schema guarantees syntax, not semantics — hallucinated values still validate.
- Make absence representable (nullable fields, an `"unclear"` enum value) or the model will invent.
- Robust extraction needs schema + a separate semantic validator + a retry loop that feeds errors back.

---

## Running an exercise

```bash
npm run <script>     # e.g. npm run m1:hello
```

Output goes to stdout. Each script reads `ANTHROPIC_API_KEY` from `.env` via `dotenv` — make sure your key is set before running.

## What's next

Modules 3–13 and the capstone are upcoming — each will land here with its own exercises and notes as the lab grows.

## Revision notes

Concept refreshers for each completed module — read these before re-running the exercises or sitting the exam.

- [Revision index](revision/README.md)
- [Module 1 — Claude API Fundamentals](revision/module-01-api-fundamentals.md)
- [Module 2 — Tools and `tool_use`](revision/module-02-tools.md)
