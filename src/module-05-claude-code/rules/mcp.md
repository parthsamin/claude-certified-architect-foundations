---
paths: ["src/module-04-mcp/**/*.js", "**/mcp-host.js"]
---

# MCP integration rules — conditionally loaded for MCP code

Loaded only when Claude Code is editing files in `src/module-04-mcp/`
or any `mcp-host.js` (wherever that pattern moves to).

## Schema translation

MCP tool definitions arrive as `{ name, description, inputSchema }`
(camelCase). The Anthropic API uses `input_schema` (snake_case).
**Rename at the boundary** in `mcp-host.js`. Never let `inputSchema`
leak past the host into the Agent class.

## Response envelopes

MCP responses are `{ content: [{ type: "text", text: "..." }] }`.
Before handing to the Agent, **unwrap** to extract the text and
`JSON.parse(text)` for structured data. Surface `isError: true` straight
through so the Agent's reasoning can branch on it.

## Errors

Tool errors must be **structured**, not strings. Required fields:
`errorCategory` (transient / permanent / validation / auth / not_found),
`isRetryable` (boolean), `message`, `attempted_query`. Optional but
strongly preferred: `partial_results`, `retry_after_seconds`.

## Resource vs tool

If a piece of information is **static or structural** (catalog, schema,
docs, sprint snapshot) — publish it as a **resource**, not a tool. Read-only
"list/describe" tools belong in the resource channel.
