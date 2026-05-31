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

## Files

- `kb-server.js` — MCP server publishing `search_knowledge_base`
  (tool) and `kb://catalog` (resource).
- `research-network.js` — the orchestrator: coordinator + three
  subagent definitions + validation + state persistence.
