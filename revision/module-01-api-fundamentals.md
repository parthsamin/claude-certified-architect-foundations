# Module 1 — Claude API Fundamentals

> Exam relevance: foundational — underpins all 5 domains, especially Domain 1 (Agent Architecture, 27%) and Domain 5 (Context Management, 15%).

---

## 1.1 API Request Structure

The Claude Messages API is a **stateless request → response** model. No server-side memory — the model knows only what is in *this* request.

| Field | Purpose |
|---|---|
| `model` | `claude-opus-4-6` (most capable) · `claude-sonnet-4-6` (balanced) · `claude-haiku-4-5` (fastest/cheapest). Choosing it is a cost/latency/capability trade-off. |
| `max_tokens` | Hard cap on the **response** only. Does not limit input. |
| `system` | System prompt — separate top-level field, not in `messages`. |
| `messages` | Full conversation history (resent every call). |
| `tools` / `tool_choice` | Tool definitions and selection strategy. |

Response carries: `content` (array of blocks), `stop_reason`, `usage` (token counts).

---

## 1.2 Message Roles

Three roles: `user`, `assistant`, `tool`.

- `assistant` turns are the model's past replies — **you** push them back into `messages` yourself.
- Roles must **strictly alternate**, array starts with `user`. Two same-role turns in a row = API validation error.
- A tool result is delivered **inside a `user` turn** as a `tool_result` block. There is no literal `role: "tool"`.

The multi-turn loop: send `messages` → get reply → append reply as `assistant` → append next `user` turn → resend.

---

## 1.3 The `stop_reason` Field

| Value | Meaning | Correct action |
|---|---|---|
| `end_turn` | Finished naturally | Show result to user |
| `tool_use` | Paused — wants a tool | Run tool, append result, **call API again** |
| `max_tokens` | Hit output cap — **truncated** | Never show as final; raise cap / continue |
| `stop_sequence` | Hit a configured stop string | Handle per app logic; string excluded from output |

`tool_use` and `end_turn` drive the agent loop.

---

## 1.4 The Agentic Loop

An agent = a **`while` loop** branching on `stop_reason`:

```
loop:
  res = API(messages, tools)
  messages.push(assistant: res.content)   # echo FULL content, incl. tool_use blocks
  if res.stop_reason != "tool_use": done, break
  run each tool_use block
  messages.push(user: [tool_result blocks])   # paired by tool_use_id
```

- Must be a `while`, not an `if` — the model may need several trips.
- `tool_result.tool_use_id` must match the `tool_use` block's `id`.

---

## 1.5 The System Prompt

- Separate `system` field; **priority over user messages**; loaded once, applies throughout.
- Home for role, constraints, guardrails, output format.
- **Exam trap:** wording creates *unintended tool associations*. Absolute phrasing ("ALWAYS verify the customer") **biases** the model to over-call a tool. Fix = scope it conditionally ("call X only when…").
- `tool_choice` *forces*; the system prompt only *biases* — keep the distinction.

---

## 1.6 The Context Window

Total tokens processed per request = system prompt + full history + tool definitions + tool results. Finite; all of it resent every call.

| Failure mode | Symptom | Mitigation |
|---|---|---|
| Lost-in-the-middle | Mid-input facts missed | Put key info at start or end |
| Tool-result accumulation | Cost/latency balloon over a session | Trim tool output to needed fields |
| Progressive summarization drift | Numbers/dates degrade to "about", "a few" | Extract exact figures into a preserved facts block |

---

## Exam traps — Module 1

- "Agent shows incomplete answers" → not checking `max_tokens`.
- "Agent stops after one tool call" → loop is an `if`, not a `while`.
- "Agent forgets earlier conversation" → history not resent / `assistant` turns not appended.
- "Agent over-calls a tool on irrelevant messages" → system-prompt wording (scope it); or a missing required arg blocks fabrication.
- "Answers get vaguer over a long session" → summarization drift.
