# Reference — Client SDK vs the real Agent SDK

> Exam relevance: Domain 1. The exam names the **Claude Agent SDK** as a core
> technology. This lab teaches the agent loop by **hand-rolling it on the Client
> SDK** so the mechanics are visible (see [Module 3](module-03-agent-sdk.md)).
> This page maps every hand-rolled concept to its real Agent-SDK counterpart so
> you recognize both on the exam.

---

## Two different packages

| | Client SDK | Agent SDK |
|---|---|---|
| npm package | `@anthropic-ai/sdk` | `@anthropic-ai/claude-agent-sdk` |
| Python package | `anthropic` | `claude-agent-sdk` |
| What it is | The Messages API client | "Claude Code as a library" |
| The loop | **You** write it (`while` over `messages.create`, branch on `stop_reason`) | **Claude** runs it; you iterate the messages it yields |
| Entry point | `client.messages.create({...})` | `query({ prompt, options })` |
| Tools | You define `{name, description, input_schema}` + execute them yourself | Built-in (Read/Write/Edit/Bash/Glob/Grep/WebSearch/WebFetch), plus MCP and custom |
| In this lab | Every `m1`–`m4` exercise, `agent.js`, the capstone | **`m3:sdk` only** (`06-real-agent-sdk.js`) |

The docs' own one-liner: *"With the Client SDK, you implement a tool loop. With
the Agent SDK, Claude handles it."*

---

## Concept-for-concept translation

| Lab (hand-rolled, Client SDK) | Real Agent SDK |
|---|---|
| `new Agent({...}).run(prompt)` | `for await (const m of query({ prompt, options })) {...}` |
| The `for` loop + `stop_reason` branch in `agent.js` | Gone — the SDK runs the loop; you read `result` messages |
| `AgentDefinition`: `{ name, systemPrompt, allowedTools, toolCatalog }` | `AgentDefinition`: `{ description, prompt, tools }` — note **`prompt`** not `systemPrompt`, **`tools`** not `allowedTools` |
| `allowedTools` is a **hard filter** — tools not listed are invisible to the model | `allowedTools` is an **auto-approve list** — unlisted tools still exist but need permission (`permissionMode`) or a hook to gate them |
| Custom tool schema `{name, description, input_schema}` + JS `handler` | Built-in tools by name; custom tools via MCP / `createSdkMcpServer` |
| Hand-rolled `Task` tool + `subagent_type` enum (`03`/`04-*.js`) | `options.agents: { "<name>": AgentDefinition }` + the built-in **`Agent`** tool (add `"Agent"` to `allowedTools`) |
| Parallel fan-out via `Promise.all` over multiple `tool_use` blocks | SDK schedules subagent runs; observe with `SubagentStart` / `SubagentStop` hooks |
| `hooks.preToolUse(cb)` returning a value to short-circuit | `hooks.PreToolUse: [{ matcher, hooks: [cb] }]`; deny via `hookSpecificOutput.permissionDecision: "deny"` |
| `hooks.postToolUse(cb)` returning a transformed result | `hooks.PostToolUse` with `hookSpecificOutput.updatedToolOutput` |
| (none — lab returns final text from `end_turn`) | Rich event stream: `assistant`, `result`, `system`, `SubagentStart/Stop`, `SessionStart/End`, … |
| Sessions: only as Claude Code CLI flags in [Module 5](module-05-claude-code.md) (`--resume`, `fork_session`) | First-class: capture `session_id` from the `system`/init message, resume via `options.resume`, or fork |
| Provider/auth: `new Anthropic({ apiKey })` | `ANTHROPIC_API_KEY` env var; also Bedrock/Vertex/Azure via `CLAUDE_CODE_USE_*` |

---

## Real `PreToolUse` hook — the shape to recognize

```js
hooks: {
  PreToolUse: [
    { hooks: [auditLog] },                  // no matcher -> every tool call
    { matcher: 'Bash', hooks: [denyBash] }, // exact tool-name match
  ],
}

// deny inside the callback:
return {
  hookSpecificOutput: {
    hookEventName: input.hook_event_name,
    permissionDecision: 'deny',            // 'allow' | 'deny' | 'ask' | 'defer'
    permissionDecisionReason: '...',       // fed back to the model
  },
};
// return {} to allow unchanged. deny always wins over other hooks.
```

---

## Three other Claude tools the Agent SDK sits beside (exam framing)

- **Client SDK** — direct API access; you implement the tool loop.
- **Agent SDK** — the loop + built-in tools running **in your process**.
- **Claude Code CLI** — same engine, interactive terminal (Module 5).
- **Managed Agents** — a hosted REST API; Anthropic runs the loop and a
  sandbox for you.

---

## See it run

`npm run m3:sdk` — [`06-real-agent-sdk.js`](../src/module-03-agent-sdk/06-real-agent-sdk.js)
exercises `query()`, `allowedTools`, a real `PreToolUse` deny hook, and a
subagent via `options.agents{}` + the `Agent` tool. It needs the
`@anthropic-ai/claude-agent-sdk` package, `ANTHROPIC_API_KEY`, and network.
