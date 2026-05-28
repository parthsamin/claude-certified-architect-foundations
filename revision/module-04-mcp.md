# Module 4 — Model Context Protocol (MCP)

> Exam relevance: Domain 2 (Tool Design & MCP Integration, **18%**).

---

## 4.1 What MCP Is

**MCP** = Model Context Protocol. An **open protocol** for connecting external systems to Claude. Build a server once → every MCP-aware client (Claude Code, Claude Desktop, custom agents) can use it.

Three primary primitives:

| Primitive | Role |
|---|---|
| **Tools** | Functions the agent can **call** to take actions (CRUD, API calls, command execution). |
| **Resources** | Read-only **data** the agent fetches for context (catalogs, schemas, docs). |
| **Prompts** | Predefined prompt templates the server publishes. |

An MCP **server** is a process implementing the protocol. The **client** auto-discovers tools via `listTools()` — you don't hand-wire tool names. Tools from all connected servers are unioned into one effective `tools` array.

Transport: usually **stdio** (server as subprocess, JSON-RPC over stdin/stdout) for local; HTTP/SSE for remote.

---

## 4.2 Configuring MCP Servers

Two config files — exam tests both:

| File | Location | Purpose |
|---|---|---|
| `.mcp.json` | Project root, **version-controlled** | Team-shared servers |
| `~/.claude.json` | User home, **not** version-controlled | Personal / experimental |

Canonical `.mcp.json` shape:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
    }
  }
}
```

**Secrets** never live in the file — they go in env vars, referenced as `${VAR_NAME}`. The `${VAR_NAME}` syntax is literal; not `${process.env.X}`.

**Build vs reuse:**

- **Standard SaaS** (GitHub, Jira, Slack, Linear, Notion) → use **existing** community MCP server.
- **Internal proprietary** services → **build your own**, ship as a versioned package.

Both end up in `.mcp.json` for team-shared use. Personal experimentation → `~/.claude.json`.

---

## 4.3 Integrating MCP Tools into the Agent (lab pattern)

Translation between MCP and Anthropic API:

- Rename **`inputSchema` → `input_schema`** (camelCase → snake_case).
- Unwrap response envelope: `{ content: [{ type: "text", text }] }` → JSON-parse the text.
- Build a handler closure that calls `client.callTool({ name, arguments })`.

Once translated, MCP tools are **indistinguishable from native tools** inside the Agent. The agent loop doesn't change when you add a server. The architectural principle: **stable interface, swappable implementations** (same family as DNS, USB, HTTP).

Module 3 carryover applies unchanged:

- **`allowedTools`** is still a deliberate whitelist — discovery ≠ permission.
- **Hooks** (`PreToolUse` / `PostToolUse`) still apply to MCP tools.

---

## 4.4 The `isError` Flag

An MCP tool that fails sets `isError: true`. The **flag alone is not enough** — the payload is what the agent reasons over.

**Structured error (good):**

```json
{
  "isError": true,
  "content": {
    "errorCategory": "transient",
    "isRetryable": true,
    "message": "Upstream timed out.",
    "attempted_query": "ORD-1001",
    "partial_results": null,
    "retry_after_seconds": 2
  }
}
```

**Generic error (anti-pattern):** `{ "isError": true, "content": "Operation failed" }`

| Field | What the agent does with it |
|---|---|
| `errorCategory` | Branch: transient → retry, permanent → escalate, validation → reword, auth → escalate |
| `isRetryable` | Explicit retry verdict (better than inferring from category — see Module 3.5 explicit vs inferred) |
| `message` | Quote back to the user for context |
| `attempted_query` | Refine and retry without re-deriving |
| `partial_results` | Graceful degradation — present what's available |
| `retry_after_seconds` | Honor backoff |

**Rule:** *if your error response is a string, you designed it wrong.*

---

## 4.5 MCP Resources

Read-only data the agent reads for **context**. Read once at startup, embed into the system prompt → agent has the "map" before its first turn.

| | Tools | Resources |
|---|---|---|
| Grammar | **Verbs** | **Nouns** |
| Side effects | Yes | No |
| Examples | `process_refund`, `delete_repo` | `orders://catalog`, `schema://orders` |
| When fetched | When agent decides to act | Usually startup, into system prompt |
| Discovery | `listTools()` | `listResources()` |

Common resource shapes: content catalogs, database schemas, documentation, issue/task summaries.

Resources are identified by **URIs** (`orders://catalog`, `schema://orders`, `file:///path`).

**Decision rule for tool vs resource:**

- Agent **takes an action** or asks for **parameterized data** → **tool**.
- Agent reads **static or structural context** → **resource**.

The architectural win: keeping the **tool count small** and **action-focused**. If every read becomes a tool, the Module 2.1 routing problem (vague/overlapping descriptions, confused selection) reappears.

---

## Exam traps — Module 4

- "A teammate committed `.mcp.json` with the real token inline" → **two** things wrong: hard-coded secret AND committed to git (leaked forever). Fix = **rotate the token**, switch to `${TOKEN}`, set env var on each machine. Removing from the file does not unleak.
- "The agent doesn't see tools from the new MCP server" → check the agent host is actually reading `.mcp.json` and the spawn command works. Also check translation: did you keep `inputSchema` instead of renaming to `input_schema`?
- "MCP tool error is just `'Operation failed'`" → generic error anti-pattern. Add `errorCategory`, `isRetryable`, `message`, `attempted_query`, `partial_results`.
- "The agent retries permanently-failed operations forever" → `isRetryable: false` is missing or being ignored. Add it; have agent branch on it.
- "Agent makes lots of `list_*` / `describe_*` calls at the start of every session" → those should be **resources**, not tools. Move read-only "what exists" queries into resources read at startup.
- "The agent should know the company's DB schema before writing queries" → resource.
- "Which file holds personal/experimental MCP servers?" → `~/.claude.json` (not version-controlled).
- "Should I build a GitHub MCP server?" → no, use the existing community one.
