# Module 2 — Tools and `tool_use`

> Exam relevance: Domain 2 (Tool Design & MCP, 18%) and Domain 4 (Prompt Engineering & Structured Output, 20%).

---

## 2.1 Tool Definitions — Description as Selection Mechanism

`tool_use`: Claude never runs code — it emits a structured *request*; your code executes it.

A tool definition = `name` + `input_schema` + `description`.

- The model routes off **three signals**: the `name`, the schema field names, and the `description`.
- The **`description` is the selection algorithm** — and the only place you can put *contrastive* logic.
- A strong description states: what it does + what it returns; input formats + example values; edge cases/constraints; **when to use it vs a similar tool**.
- Overlapping/near-identical descriptions → the model guesses → unstable routing.
- Built-in tools (Read, Grep) can out-compete MCP tools. Fix: give the MCP tool's description a concrete reason it wins (unique/live data the built-in physically cannot access).

**Two gates before a tool runs:** (1) *can* it be called? — required args must have values; (2) *which* one? — driven by descriptions.

---

## 2.2 The `tool_choice` Parameter

| Value | Behavior | Use when |
|---|---|---|
| `{type:"auto"}` | Model decides: tool or text (or clarifying question) | Default; conversational agents |
| `{type:"any"}` | Must call **some** tool; no text turn | Guaranteed structured output, any tool |
| `{type:"tool", name:"X"}` | Must call **tool X** | Forced first step / execution ordering |

**Trade-off:** `any` / `tool` prevent a text-only turn → the model **cannot ask a clarifying question**. Wrong choice for ambiguous-input agents.

- "Stopped asking clarifying questions, now guesses" → someone set `any`/`tool`; revert to `auto`.

---

## 2.3 JSON Schemas for Structured Output

`tool_use` + JSON Schema = most reliable structured output.

Guarantees: **valid JSON + declared structure/types**. Does **not** guarantee semantic correctness.

Schema design rules:

| Rule | Why |
|---|---|
| `required` only for always-present data | A required field forces fabrication when data is absent |
| Nullable types `["string","null"]` | Lets the model honestly return `null` |
| `required` + nullable together | Field always present **and** honestly `null` when absent — predictable shape |
| Enum `"other"` + detail string | Data outside categories isn't lost/force-fit |
| Enum `"unclear"` (+ `confidence`) | Honest uncertainty beats a confident wrong label |

---

## 2.4 Syntax vs Semantic Errors

| Class | Example | Fix |
|---|---|---|
| **Syntax** | Invalid JSON, wrong field type | `tool_use` + JSON Schema — **eliminates** it |
| **Semantic** | Total ≠ line items; value in wrong field; hallucination | Separate layer — validation, retry-with-feedback, self-correction |

**Defense in depth:**
1. **Schema** → kills syntax errors.
2. **Validator** (your code) → detects semantic errors (sum checks, range, cross-field).
3. **Retry-with-feedback** → send the model its wrong output + the *specific* error; ask it to correct.
4. **Cap + escalate** → after N failed retries, hand to a human (don't loop forever).

Retry feedback must be **actionable** ("total 999.99 ≠ sum 87.50"), not "try again".

---

## Exam traps — Module 2

- "Agent keeps calling the wrong of two similar tools" → fix the **descriptions** (contrastive). Distractors: "delete a tool", "force with `tool_choice`".
- "Need JSON, never prose" → `tool_choice: any` (or `tool` for one specific schema).
- "Extractor invents IDs/dates not in the source" → field marked `required`; make it nullable.
- "Valid JSON but wrong values" → **semantic** error → validator + retry, not a schema change.
- "Sometimes returns broken JSON" → **syntax** → use `tool_use` with a schema.
