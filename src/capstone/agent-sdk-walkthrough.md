# Building the Multi-Agent Research Network with the Claude Agent SDK

A step-by-step walkthrough of [`research-network-sdk.js`](research-network-sdk.js) —
the capstone built on the **real** Claude Agent SDK
(`@anthropic-ai/claude-agent-sdk`). By the end you'll understand every line:
how `query()` runs the loop, how subagents are declared and spawned, how an
in-process MCP tool drives schema-validated retry, and how the SDK's hooks are
bridged into the live dashboard.

> **New to the two-SDK distinction?** Read
> [`revision/agent-sdk-vs-client-sdk.md`](../../revision/agent-sdk-vs-client-sdk.md)
> first. TL;DR: the **Client SDK** (`@anthropic-ai/sdk`) makes *you* write the
> agent loop (that's the hand-rolled [`research-network.js`](research-network.js));
> the **Agent SDK** runs the loop *for you* via `query()` (this file). The
> Module-3 bridge exercise [`m3:sdk`](../module-03-agent-sdk/06-real-agent-sdk.js)
> is the single-agent warm-up for what we build here.

---

## What we're building

```
                       USER QUESTION
                            │
                            ▼
                      COORDINATOR              ← main-thread agent (query)
                  delegates via Agent tool
              ┌───────────┼───────────┐
              ▼           ▼           ▼
        researcher_  researcher_  researcher_   ← options.agents{} subagents
            art        music         lit          (run in PARALLEL)
              │           │           │
              └───────► kb-server.js ◄┘          ← MCP server (stdio)
                  search_knowledge_base
                            │
                            ▼
                       SYNTHESIZER              ← another subagent
                   calls record_report
                            │
                            ▼
                  record_report tool            ← in-process MCP tool:
              (zod schema + semantic checks)        validates, retries, captures
                            │
                            ▼
                    FINAL VALIDATED REPORT
                 (provenance + coverage notes)
```

The whole thing runs inside **one** `query()` call. We never write a loop, a
`stop_reason` branch, or a `Task` tool — the SDK does all of that. Our job is to
*configure* the network and *observe* it.

---

## Prerequisites

```bash
npm install           # pulls @anthropic-ai/claude-agent-sdk + zod
# .env must contain a real ANTHROPIC_API_KEY
```

The Agent SDK bundles and spawns the Claude Code binary as a subprocess, so this
edition needs network access. Run it with `npm run capstone:sdk`.

---

## Step 1 — Imports and constants

```js
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Tracer } from "./tracer.js";
import { startLiveServer } from "./live-server.js";
```

Three import groups, three jobs:

- **`query, tool, createSdkMcpServer`** — the entire Agent SDK surface we need.
  `query()` runs an agent; `createSdkMcpServer` + `tool()` let us define an
  **in-process** MCP tool (our `record_report`).
- **`Client, StdioClientTransport`** (the plain MCP SDK) — used *only* to read
  the `kb://catalog` resource once at startup. The agent itself reaches the KB a
  different way (Step 6).
- **`Tracer, startLiveServer`** — reused **unchanged** from the hand-rolled
  capstone. This is what makes the live dashboard "just work."

```js
const KB_SERVER = path.join(__dirname, "kb-server.js");
const STATE_PATH = path.join(__dirname, "state-sdk.json");   // separate from capstone
const TRACE_JSON = path.join(__dirname, "trace-sdk.json");
const TRACE_MMD = path.join(__dirname, "trace-sdk.mmd");

const MODEL = "claude-sonnet-4-6";                 // project model lock (CLAUDE.md)
const REQUIRED_TOPICS = ["visual_art", "music", "literature"];

const KB_TOOL = "mcp__kb__search_knowledge_base";
const REPORT_TOOL = "mcp__report__record_report";
```

**Key detail — MCP tool naming.** When you register an MCP server under
`options.mcpServers` with a key like `kb`, every tool it exposes is renamed
`mcp__<key>__<toolName>`. So `kb-server.js`'s `search_knowledge_base` becomes
`mcp__kb__search_knowledge_base`. We capture both full names as constants because
we'll reference them in three places: the subagents' tool allowlists, the
top-level `allowedTools`, and the hook bridge.

---

## Step 2 — The pieces we reuse (don't rebuild these)

Three files are shared with the hand-rolled capstone and need no changes:

- **`kb-server.js`** — a real MCP server (stdio). It publishes one tool,
  `search_knowledge_base(topic)`, returning documents with full provenance
  (`claim`, `source_name`, `publication_date`, `methodology`, `confidence`), and
  one resource, `kb://catalog`, mapping each topic to a document count. It
  deliberately holds **two conflicting music numbers** (Spotify 12% / 2024 vs
  MIA 8% / 2023) so we can exercise the provenance-under-conflict pattern.
- **`tracer.js`** — an event recorder. Call `tracer.agentStart(...)`,
  `tracer.subagentSpawn(...)`, etc., and it appends a typed event and notifies
  subscribers. The dashboard is one such subscriber.
- **`live-server.js`** — `startLiveServer(tracer, port)` opens an HTTP+SSE
  server, subscribes to the tracer, and streams every event to the browser at
  `http://localhost:3737/`.

The dashboard understands exactly six event kinds: `agent_start`, `agent_end`,
`subagent_spawn`, `subagent_return`, `tool_call_request`, `tool_call_result`.
**Our entire integration job is to produce those six from the Agent SDK** — that's
Step 7.

---

## Step 3 — Start the live dashboard

```js
const tracer = new Tracer();
const LIVE_ENABLED = process.env.LIVE !== "0";       // ON by default
const LIVE_PORT = Number(process.env.LIVE_PORT) || 3737;
let liveServer = null;
if (LIVE_ENABLED) {
  liveServer = startLiveServer(tracer, LIVE_PORT);
  // …banner…
  await new Promise((r) => setTimeout(r, 5000));      // 5s to open the browser
}
```

Identical to the hand-rolled capstone: build a `Tracer`, start the server, pause
5 seconds so you can open the browser before the flow begins. `LIVE=0` skips it
(headless/CI); `LIVE_PORT` overrides the port.

---

## Step 4 — State persistence (Module 11.6)

```js
function loadState() {
  if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  return { started_at: new Date().toISOString(), findings: {}, manifest: {} };
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}
const state = loadState();
```

A tiny JSON store. We write to it **after each subagent finishes** (in the
`SubagentStop` hook, Step 7) so the run leaves a durable manifest of what
completed. Uses `state-sdk.json` to avoid clobbering the hand-rolled capstone's
`state.json`.

---

## Step 5 — The report contract: zod schema + semantic validator

Two layers, because **JSON Schema (or zod) guarantees *syntax*, never
*semantics*** (Module 2.3). The zod shape defines the structure:

```js
const reportShape = {
  title: z.string(),
  sections: z.array(
    z.object({
      topic: z.enum(["visual_art", "music", "literature"]),
      coverage: z.enum(["FULL", "PARTIAL"]),
      coverage_note: z.string().nullable().optional(),
      bullets: z.array(
        z.object({
          claim: z.string(),
          source_name: z.string(),
          publication_date: z.string(),
        }),
      ),
    }),
  ),
};
```

The `topic` and `coverage` enums stop the model drifting to unmapped labels. But
zod can't catch "all three topics present" or "a FULL section has zero bullets" —
those are *semantic* rules, so we add a hand-written validator:

```js
function validateReport(report) {
  const errs = [];
  const got = new Set(report.sections.map((s) => s.topic));
  for (const t of REQUIRED_TOPICS) if (!got.has(t)) errs.push(`missing topic: ${t}`);
  for (const s of report.sections) {
    if (s.coverage === "PARTIAL" && !s.coverage_note) errs.push(`section '${s.topic}' is PARTIAL but has no coverage_note`);
    if (s.bullets.length === 0 && s.coverage === "FULL") errs.push(`section '${s.topic}' is FULL but has zero bullets`);
    for (const b of s.bullets) {
      if (!b.source_name) errs.push(`section '${s.topic}': a bullet has no source_name`);
      if (!b.publication_date) errs.push(`section '${s.topic}': a bullet has no publication_date`);
    }
  }
  return errs;
}
```

This enforces coverage annotations (Module 10.4) and provenance on every bullet
(Module 12). It returns a list of human-readable errors — which becomes the
*feedback* in retry-with-feedback.

---

## Step 6 — `record_report` as an in-process MCP tool (the clever bit)

In the hand-rolled capstone, the synthesizer was an `Agent` with a `record_report`
tool whose handler captured the structured payload via a closure. We reproduce
*exactly* that, but as a real Agent SDK custom tool:

```js
let capturedReport = null;   // closure target — the authoritative output

const reportServer = createSdkMcpServer({
  name: "report",
  version: "0.1.0",
  tools: [
    tool(
      "record_report",
      "Record the FINAL research report. One section per topic …",
      reportShape,                              // zod shape → enforced by the SDK
      async (args) => {
        const errs = validateReport(args);      // semantic layer
        if (errs.length > 0) {
          return {                              // ← drives RETRY-WITH-FEEDBACK
            content: [{ type: "text",
              text: "VALIDATION FAILED — fix these and call record_report again:\n- " + errs.join("\n- ") }],
            isError: true,
          };
        }
        capturedReport = args;                  // ← capture on success
        return { content: [{ type: "text", text: "Report recorded and validated. ✓" }] };
      },
    ),
  ],
});
```

What makes this powerful:

1. **`tool(name, description, zodShape, handler)`** — the SDK validates the
   model's arguments against the zod shape *before* your handler runs. Syntax is
   handled for free.
2. **The handler is the semantic gate.** It runs `validateReport`. On failure it
   returns `isError: true` with the specific problems. Because this happens
   *inside the SDK's loop*, the synthesizer sees the error as a tool result and
   **corrects itself and calls `record_report` again** — retry-with-feedback
   (Module 2.4) with zero orchestration code from us.
3. **The closure capture.** On success we stash `args` into `capturedReport`.
   After `query()` finishes we read it back as the authoritative structured
   output (the model's prose answer is secondary).
4. **`createSdkMcpServer`** packages the tool as an **in-process** MCP server —
   no subprocess, the handler is a plain JS function in this file. We plug it
   into `options.mcpServers` in Step 8.

---

## Step 7 — Read the `kb://catalog` resource (Module 4.5)

```js
async function readCatalog() {
  const transport = new StdioClientTransport({ command: "node", args: [KB_SERVER] });
  const client = new Client({ name: "catalog-reader", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const res = await client.readResource({ uri: "kb://catalog" });
    return res.contents.map((c) => c.text).join("\n");
  } finally {
    await client.close();
  }
}
```

We spin up a short-lived plain-MCP client purely to read the catalog resource,
then close it. The catalog (`{ "visual_art": 2, "music": 2, "literature": 2 }`)
is injected into the coordinator's prompt so it knows what topics exist
**before** making any tool call — the "resource as a map" pattern. (The agent's
*tool* access to the KB is configured separately in Step 8; this is just the
read-once-at-startup context.)

---

## Step 8 — Define the subagents (`options.agents{}`)

This is where the Agent SDK's `AgentDefinition` replaces the lab's hand-rolled
one. Note the **real field names**: `description`, `prompt` (not `systemPrompt`),
`tools` (not `allowedTools`).

```js
function researcher(topic) {
  return {
    description: `Research specialist for the '${topic}' topic.`,
    prompt:
      `You are a research specialist for the '${topic}' topic. Call ` +
      `search_knowledge_base with topic="${topic}". Return a JSON object ` +
      `{ topic, findings: [...] } where each finding is the FULL document … ` +
      `If two documents disagree, return BOTH. …`,
    tools: [KB_TOOL],          // least privilege: ONLY the KB tool
    model: "inherit",
  };
}

const agents = {
  researcher_art:   researcher("visual_art"),
  researcher_music: researcher("music"),
  researcher_lit:   researcher("literature"),
  synthesizer: {
    description: "Composes the final validated report from researcher findings. No KB access.",
    prompt:
      "You are a research synthesizer … Produce the final report by calling " +
      "record_report. Rules: one section per topic; coverage FULL/PARTIAL …; " +
      "each bullet MUST include claim, source_name, publication_date copied " +
      "verbatim …; if two findings disagree INCLUDE BOTH with dates …; if " +
      "record_report returns a validation error, fix and call it again.",
    tools: [REPORT_TOOL],      // least privilege: ONLY record_report
    model: "inherit",
  },
};
```

Two exam patterns baked in:

- **Least privilege (Module 3.2).** Each researcher can *only* search the KB;
  the synthesizer can *only* record the report. A researcher literally cannot
  call `record_report`, and the synthesizer cannot touch the KB — enforced by the
  SDK, not by a "please don't" in the prompt.
- **Isolated context (Module 3.3).** Each subagent runs in its own context
  window. The synthesizer doesn't see the researchers' transcripts — the
  coordinator must *pass the findings into the synthesizer's spawn prompt*. The
  synthesizer's prompt says "you receive findings inlined in your prompt," and
  the coordinator's instructions (Step 9) tell it to do exactly that.

`model: "inherit"` makes subagents use the same model as the main thread.

---

## Step 9 — The hooks → Tracer bridge (how the dashboard gets fed)

The hand-rolled `Agent` class emits Tracer events from inside its loop. The Agent
SDK owns the loop, so we can't do that. Instead we attach **hooks** — callbacks
the SDK fires at lifecycle points — and translate each into the Tracer event the
dashboard expects:

| SDK hook        | Tracer event(s) emitted              | Dashboard effect                    |
|-----------------|--------------------------------------|-------------------------------------|
| `SubagentStart` | `subagent_spawn` + `agent_start`     | yellow arrow coordinator→subagent; subagent card appears "running" |
| `SubagentStop`  | `agent_end` + `subagent_return`      | green arrow back; card done; **state persisted** |
| `PreToolUse`    | `tool_call_request` (+ auto-approve) | blue arrow agent→tool               |
| `PostToolUse`   | `tool_call_result`                   | teal arrow tool→agent               |

Some bookkeeping first:

```js
const SKIP_TOOLS = new Set(["Agent", "Task"]);   // delegation tools: not drawn as tool nodes
const toolStartedAt = new Map();                  // tool_use_id -> start ms (for latency)
const subStartedAt = new Map();                   // agent_id   -> start ms
const iterByAgent = new Map();                     // agent label -> best-effort iter #

function cleanToolName(name) {                     // mcp__kb__search… -> search…
  return name.startsWith("mcp__") ? name.split("__").pop() : name;
}
const ALLOW = (input) => ({
  hookSpecificOutput: {
    hookEventName: input.hook_event_name,
    permissionDecision: "allow",
    permissionDecisionReason: "auto-approved by capstone harness",
  },
});
```

`SKIP_TOOLS` matters: the coordinator delegates with the built-in **`Agent`**
tool, but we don't want an "Agent" box in the topology — the spawn arrows come
from `SubagentStart/Stop` instead (same way the dashboard hides the hand-rolled
`Task` tool). `cleanToolName` strips the `mcp__<server>__` prefix so the
dashboard shows `search_knowledge_base`, not `mcp__kb__search_knowledge_base`.

Now the hooks themselves. **`PreToolUse`** records the request and auto-approves:

```js
PreToolUse: [{ hooks: [async (input) => {
  const label = input.agent_type || "coordinator";   // agent_type set inside a subagent
  if (!SKIP_TOOLS.has(input.tool_name)) {
    toolStartedAt.set(input.tool_use_id, Date.now());
    tracer.toolCallRequest(label, nextIter(label),
      cleanToolName(input.tool_name), input.tool_input, input.tool_use_id);
  }
  return ALLOW(input);   // headless runs must never stall on a permission prompt
}]}],
```

Two things to understand:

- **`input.agent_type`** is present when the hook fires *inside a subagent* (and
  equals the subagent's name, e.g. `researcher_art`); it's absent on the main
  thread, so we fall back to `"coordinator"`. That single field is how we label
  every tool call with the correct node.
- **`return ALLOW(input)`** is essential. In the Agent SDK, `allowedTools` is an
  *auto-approve list*, not a hard filter — tools not on it would otherwise prompt
  for permission and **hang a headless run**. Returning `permissionDecision:
  "allow"` from the hook guarantees the call proceeds. (Contrast the hand-rolled
  `Agent`, where a tool not in `allowedTools` is simply invisible.)

**`PostToolUse`** closes the loop with latency:

```js
PostToolUse: [{ hooks: [async (input) => {
  if (!SKIP_TOOLS.has(input.tool_name)) {
    const t0 = toolStartedAt.get(input.tool_use_id) || Date.now();
    tracer.toolCallResult(input.agent_type || "coordinator",
      iterByAgent.get(input.agent_type || "coordinator") || 1,
      cleanToolName(input.tool_name), input.tool_use_id,
      input.tool_response, Date.now() - t0);
  }
  return {};
}]}],
```

`input.tool_response` carries the result; we pair it to the request via
`tool_use_id` and compute elapsed ms from the map.

**`SubagentStart`** draws the spawn and gives the subagent a live card:

```js
SubagentStart: [{ hooks: [async (input) => {
  subStartedAt.set(input.agent_id, Date.now());
  tracer.subagentSpawn("coordinator", input.agent_type, `spawned ${input.agent_type}`);
  tracer.agentStart(input.agent_type, `spawned ${input.agent_type}`);
  return {};
}]}],
```

**`SubagentStop`** returns the arrow, ends the card, and **persists state**:

```js
SubagentStop: [{ hooks: [async (input) => {
  const t0 = subStartedAt.get(input.agent_id) || Date.now();
  const out = input.last_assistant_message || "(no final message)";
  tracer.agentEnd(input.agent_type, out);
  tracer.subagentReturn("coordinator", input.agent_type, out, Date.now() - t0);
  state.findings[input.agent_type] = { status: "ok", output: out, ts: new Date().toISOString() };
  state.manifest[input.agent_type] = "completed";
  saveState(state);                  // ← Module 11.6 happens here
  return {};
}]}],
```

`input.last_assistant_message` is a convenience field the SDK provides so we don't
have to read and parse the subagent's transcript file.

---

## Step 10 — Assemble and run `query()`

```js
async function main() {
  const catalogText = await readCatalog();

  const coordinatorPrompt =
    "Research how AI is affecting three creative industries … I need every " +
    "claim backed by a source name and a publication date.\n\n" +
    "Do this:\n" +
    " 1. In your FIRST turn, spawn ALL THREE researcher subagents … together " +
    "    (running them in parallel). Each researches one topic.\n" +
    " 2. When all three return, spawn the synthesizer … Pass it ALL findings " +
    "    verbatim …\n" +
    " 3. Return a short markdown summary as your final answer.\n\n" +
    "Topics available in the KB:\n" + catalogText;

  tracer.agentStart("coordinator", coordinatorPrompt);   // mark coordinator FIRST

  let finalText = "";
  for await (const message of query({
    prompt: coordinatorPrompt,
    options: {
      model: MODEL,
      allowedTools: ["Agent", KB_TOOL, REPORT_TOOL],
      agents,
      mcpServers: {
        kb: { command: "node", args: [KB_SERVER] },   // stdio MCP server
        report: reportServer,                          // in-process MCP server
      },
      hooks,
      maxTurns: 30,
    },
  })) {
    if (message.type === "result" && message.subtype === "success") {
      finalText = message.result;
    }
  }

  tracer.agentEnd("coordinator", finalText);
  // …validation + trace artifacts + keep-alive…
}
```

The whole network is this one `query()`. Notes:

- **`tracer.agentStart("coordinator", …)` BEFORE the loop.** The dashboard tags
  the *first* `agent_start` it sees as the coordinator (yellow). Emitting it
  manually here guarantees the main thread gets that role; subagents' later
  `agent_start`s are correctly tagged as subagents (blue).
- **`allowedTools: ["Agent", KB_TOOL, REPORT_TOOL]`** auto-approves the
  coordinator's delegation tool plus the two MCP tools on the main thread.
  Subagent-level calls are covered by the `PreToolUse` allow hook.
- **`agents`** wires in the four subagent definitions; **`mcpServers`** mounts
  both the stdio KB server *and* our in-process `report` server side by side.
- **`hooks`** attaches the whole bridge from Step 9.
- **Consuming the stream:** `query()` yields a stream of messages; the final
  answer arrives as a `result` message with `subtype === "success"`.
- **Parallelism is opportunistic.** We *instruct* the coordinator to spawn all
  three researchers in its first turn, but whether it fans out is model-driven
  (the same caveat as Module 3.4). In practice it does — you'll see the three
  start within ~1s of each other.

---

## Step 11 — Validate, persist artifacts, keep the dashboard alive

```js
console.log("\n================= VALIDATION =================");
if (!capturedReport) {
  console.log("✗ synthesizer never produced a valid record_report payload.");
} else {
  const errs = validateReport(capturedReport);
  if (errs.length === 0) {
    console.log("✓ structured report passed schema + semantic validation.");
    for (const s of capturedReport.sections)
      console.log(`  • ${s.topic}: ${s.coverage}` + (s.coverage_note ? ` — ${s.coverage_note}` : ""));
  } else {
    console.log("✗ residual validation errors:\n- " + errs.join("\n- "));
  }
}

try {
  tracer.writeJSON(TRACE_JSON);     // raw event array
  tracer.writeMermaid(TRACE_MMD);   // mermaid sequence diagram
  tracer.printSummary();            // ASCII flow tree to stdout
} catch (e) { /* … */ }

if (liveServer) {
  // park until Ctrl+C so you can keep exploring the dashboard
  process.on("SIGINT", () => { liveServer.close(); process.exit(0); });
  await new Promise(() => {});
}
```

We read back `capturedReport` (set by the tool handler in Step 6) and re-validate
it as a belt-and-suspenders check, print per-section coverage, write the trace
artifacts, then park so the dashboard stays live.

Finally, **graceful degradation** — the run needs the SDK package + network, so
the top-level catch explains exactly what's missing instead of dumping a stack
trace:

```js
main().catch((err) => {
  console.error("\ncapstone:sdk failed.");
  console.error("This run needs @anthropic-ai/claude-agent-sdk installed, a valid " +
    "ANTHROPIC_API_KEY, and network access (the SDK spawns the Claude Code binary).");
  console.error(`\nUnderlying error: ${err?.stack ?? err?.message ?? err}`);
  if (liveServer) liveServer.close();
  process.exit(1);
});
```

---

## Run it and read the output

```bash
npm run capstone:sdk            # dashboard ON; open http://localhost:3737/
LIVE=0 npm run capstone:sdk     # headless
```

A healthy run prints an **AGENT FLOW SUMMARY** like this (note the three
researchers overlapping in time — parallel spawn working):

```
[+ 8219ms] coordinator ── Task ──▶ researcher_art
  [+ 9196ms] coordinator ── Task ──▶ researcher_music
    [+10246ms] coordinator ── Task ──▶ researcher_lit
           [researcher_art]   🔧 search_knowledge_base({"topic":"visual_art"})
           [researcher_music] 🔧 search_knowledge_base({"topic":"music"})
           [researcher_lit]   🔧 search_knowledge_base({"topic":"literature"})
      [+19554ms] researcher_music ◀── returns ── coordinator  (10358ms)
      [+20863ms] researcher_art   ◀── returns ── coordinator  (12644ms)
    [+21344ms] researcher_lit     ◀── returns ── coordinator  (11098ms)
    [+33846ms] coordinator ── Task ──▶ synthesizer
           [synthesizer] 🔧 record_report({"title":"…","sections":[…]})
           [synthesizer] ↩ record_report → "Report recorded and validated. ✓"
    [+46742ms] synthesizer ◀── returns ── coordinator
```

followed by:

```
================= VALIDATION =================
✓ structured report passed schema + semantic validation.
  • visual_art: FULL
  • music: FULL
  • literature: FULL
```

In the **browser dashboard** you'll see the coordinator (yellow) fan out to
three researchers (blue) with yellow packets, blue/teal packets to the
`search_knowledge_base` tool, green returns, then a spawn to the synthesizer and
a packet to `record_report`.

---

## How the exam modules map into this file

| Module | Pattern | Where in `research-network-sdk.js` |
|---|---|---|
| 1.x | Agentic loop / `stop_reason` | hidden inside `query()` — the SDK runs it |
| 2.3 | JSON Schema for structured output | `reportShape` (zod) on the `record_report` tool |
| 2.4 | Validation + retry-with-feedback | tool handler returns `isError` → model retries |
| 3.2 | `allowedTools` / least privilege | each `AgentDefinition.tools`; top-level `allowedTools` |
| 3.3 | Hub-and-spoke + isolated context | `options.agents{}`; coordinator inlines findings |
| 3.4 | Parallel subagent spawning | coordinator spawns 3 researchers in one turn |
| 3.5 | Pre/PostToolUse hooks | the hooks bridge (Step 9) |
| 4.1–4.3 | MCP server + client | `mcpServers.kb` (stdio) + the catalog client |
| 4.4 | Structured `isError` | `kb-server.js` returns structured errors |
| 4.5 | MCP resources | `readCatalog()` preloads `kb://catalog` |
| 10.4 | Coverage annotations | `coverage` FULL/PARTIAL + `coverage_note` |
| 11.6 | State persistence | `SubagentStop` hook writes `state-sdk.json` |
| 12.x | Provenance + conflict-keeps-both | per-bullet source/date; music 12%/8% both kept |

---

## Gotchas worth remembering

- **Two SDKs need compatible versions.** `@anthropic-ai/claude-agent-sdk`
  requires `@anthropic-ai/sdk >= 0.93`; the lab is pinned to a compatible
  `^0.100`. A mismatched pin fails `npm install` with `ERESOLVE`.
- **`allowedTools` ≠ a hard filter here.** In the Agent SDK it auto-*approves*;
  unlisted tools still exist and would prompt. The `PreToolUse` allow hook is
  what guarantees headless runs don't hang.
- **MCP tool names are namespaced.** Always reference `mcp__<serverKey>__<tool>`
  in `tools`/`allowedTools`; the bare name only works inside the server.
- **Subagent labeling hinges on `agent_type`.** It's present in hooks fired from
  within a subagent and absent on the main thread — that's the whole basis for
  routing tool calls to the right dashboard node.
- **`record_report` output is the source of truth**, not the model's prose. The
  closure capture + post-run re-validation is deliberate.

---

## Where to go next

- Compare with the hand-rolled edition: [`research-network.js`](research-network.js)
  and the [capstone README](README.md) two-editions table.
- The single-agent warm-up: [`m3:sdk`](../module-03-agent-sdk/06-real-agent-sdk.js).
- The full API mapping: [`revision/agent-sdk-vs-client-sdk.md`](../../revision/agent-sdk-vs-client-sdk.md).
- Try an extension: make one researcher fail (point it at a missing topic) and
  watch the synthesizer emit a `PARTIAL` section with a `coverage_note` — the
  error-handling path (Module 10) end to end.
