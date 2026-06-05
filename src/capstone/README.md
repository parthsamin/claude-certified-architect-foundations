# Capstone — Multi-Agent Research Network

This is Scenario 3 from the official exam guide, built end-to-end on
top of the abstractions you constructed across Modules 1–13.

## What it does

Given a multi-topic research question, the network:

1. **Decomposes** the question into per-topic subtasks.
2. **Spawns researcher subagents in parallel** — one per topic.
3. Each researcher queries a real **MCP server** (`kb-server.js`) for
   relevant documents, returning claims with full **provenance**
   (source, date, methodology).
4. A **synthesizer subagent** compiles the findings into a final
   structured report with **coverage annotations** (every section
   labeled `FULL` or `PARTIAL` coverage).
5. The coordinator runs **schema validation** on the final report and
   retries with **feedback** if any required structure is missing.
6. **State is persisted** to disk after each subtask — the run is
   crash-resumable.

## Architecture

```
                       USER QUESTION
                            |
                            v
                      COORDINATOR
                 (Task tool, persists state)
                /       |        \
       researcher   researcher   researcher
        (topic A)    (topic B)    (topic C)     <-- parallel via Promise.all
           |             |             |
           v             v             v
           +------ kb-server.js -------+        <-- MCP server with the KB
                       (search_knowledge_base + kb://catalog)
                            |
                            v
                       SYNTHESIZER
                  (no tools — pure compose)
                            |
                       VALIDATOR
                  (schema + business rules)
                            |
                       FINAL REPORT
                  (provenance + coverage)
```

## Patterns from earlier modules, used here

| Module | Pattern | Where used |
|---|---|---|
| 1.3 / 1.4 | Agentic loop, `stop_reason` branching | `agent.js` |
| 2.1 / 2.3 | Tool descriptions + JSON Schema | every tool definition |
| 2.4 | Validation + retry-with-feedback | final report validator |
| 3.2 | `allowedTools` (least privilege) | per-subagent whitelists |
| 3.3 | Hub-and-spoke topology | coordinator + 3 subagent types |
| 3.4 | Polymorphic `Task` tool + parallel spawning | coordinator's Task tool |
| 3.5 | `PreToolUse` / `PostToolUse` hooks | logging hook on coordinator |
| 4.1–4.3 | MCP server + client integration | `kb-server.js` + `mcp-host.js` |
| 4.4 | Structured `isError` | researcher returns structured errors |
| 4.5 | MCP resources | `kb://catalog` map preloaded into context |
| 6.6 | Self-correction | synthesizer flags conflicts between sources |
| 10.4 | Coverage annotations | every section labeled FULL / PARTIAL |
| 11.1 | Fact block | preserved facts injected into synthesizer prompt |
| 11.6 | Structured state persistence | manifest written after each subagent |
| 12.1–12.3 | Provenance + dates | every claim carries `source` + `date` |

## Run it

```bash
npm run capstone
```

First run: full pipeline end-to-end. State written to
`src/capstone/state.json` after each step. Re-run after deleting the
state file for a fresh run.

## Two editions: hand-rolled vs the real Agent SDK

The same network is built two ways — pick the lens you want:

| | `npm run capstone` | `npm run capstone:sdk` |
|---|---|---|
| Built on | **Client SDK** (`@anthropic-ai/sdk`) + the hand-rolled `Agent` class | the real **Agent SDK** (`@anthropic-ai/claude-agent-sdk`, `query()`) |
| The loop | you write it (`agent.js`) | the SDK runs it |
| Subagents | custom `Task` tool + `subagent_type` enum | `options.agents{}` + the built-in `Agent` tool |
| MCP | `mcp-host.js` translation + a hand-spawned client | native `options.mcpServers` (stdio) |
| `record_report` | a tool on the synthesizer `Agent` | an **in-process** custom MCP tool (`createSdkMcpServer` + `tool()`) whose handler validates and drives retry |
| Live dashboard | `Tracer` calls inside `agent.js` | the SDK's **hooks** (`SubagentStart/Stop`, `PreToolUse/PostToolUse`) bridged into the *same* `Tracer` events |

Both render the identical live-flow topology (coordinator → 3 researchers
→ KB tool → synthesizer → `record_report`) because both feed the same
`Tracer` → `live-server.js` → dashboard. The SDK edition is the capstone
counterpart of the Module-3 bridge (`m3:sdk`); see
[`revision/agent-sdk-vs-client-sdk.md`](../../revision/agent-sdk-vs-client-sdk.md)
for the concept-by-concept mapping.

> 📖 **Step-by-step build guide:** for a detailed, code-by-code walkthrough of
> the Agent-SDK edition — how `query()` runs the loop, how subagents and the
> in-process `record_report` tool work, and how the SDK's hooks are bridged into
> the dashboard — read
> [`agent-sdk-walkthrough.md`](agent-sdk-walkthrough.md).

```bash
npm run capstone:sdk          # dashboard ON by default
LIVE=0 npm run capstone:sdk   # headless (no dashboard)
```

State for this edition is written to `state-sdk.json`; traces to
`trace-sdk.json` / `trace-sdk.mmd` (all git-ignored).

## Files

- `kb-server.js` — MCP server publishing `search_knowledge_base`
  (tool) and `kb://catalog` (resource). Shared by both editions.
- `research-network.js` — hand-rolled orchestrator: coordinator + three
  subagent definitions + validation + state persistence.
- `research-network-sdk.js` — Agent-SDK orchestrator: one `query()`,
  `options.agents{}` subagents, native MCP, an in-process `record_report`
  tool, and a hooks→`Tracer` bridge for the live dashboard.
- `agent-sdk-walkthrough.md` — detailed step-by-step build guide for
  `research-network-sdk.js`, explaining every section of the code.
- `tracer.js` / `live-server.js` / `live-dashboard.html` — the live-flow
  visualization, reused unchanged by both editions.
