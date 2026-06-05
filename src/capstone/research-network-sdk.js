// ===================================================================
// Capstone (Agent-SDK edition) — Multi-Agent Research Network
// ===================================================================
// Same system as research-network.js, but built on the REAL Claude
// Agent SDK (@anthropic-ai/claude-agent-sdk, query()) instead of the
// hand-rolled `Agent` class. It is the capstone counterpart of the
// Module-3 bridge exercise (m3:sdk / 06-real-agent-sdk.js).
//
//   research-network.js      -> hand-rolled loop (Client SDK)   `npm run capstone`
//   research-network-sdk.js  -> real Agent SDK (this file)       `npm run capstone:sdk`
//
// WHAT CHANGES vs the hand-rolled capstone
//   * No agent loop, no Task tool. ONE query() runs the whole network;
//     the SDK owns the loop. Subagents are declared in options.agents{}
//     and spawned by the built-in `Agent` tool (vs the lab's custom
//     `Task` + subagent_type enum).
//   * The KB MCP server is plugged in natively via options.mcpServers
//     (stdio) — no hand-written mcp-host translation needed.
//   * `record_report` is an IN-PROCESS custom MCP tool (createSdkMcpServer
//     + tool()). Its handler runs schema+semantic validation and returns
//     an error to drive retry-with-feedback INSIDE the SDK loop, and
//     captures the structured report on success (the closure trick).
//
// WHAT STAYS IDENTICAL
//   * The live dashboard. The SDK runs its own loop, so we can't sprinkle
//     Tracer calls through it like agent.js does. Instead we BRIDGE the
//     SDK's hooks (SubagentStart/Stop, PreToolUse/PostToolUse) into the
//     exact same Tracer events the dashboard already understands. The
//     Tracer, live-server.js, and live-dashboard.html are reused UNCHANGED.
//   * State persistence (state-sdk.json), provenance preservation,
//     coverage annotations, and conflict-keeps-both — all the exam
//     patterns from Modules 10/11/12.
//
// Live dashboard is ON by default (same as the capstone). Opt out with
// LIVE=0; override the port with LIVE_PORT.
//
// Run me with:  npm run capstone:sdk
// ===================================================================

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_SERVER = path.join(__dirname, "kb-server.js");
const STATE_PATH = path.join(__dirname, "state-sdk.json");
const TRACE_JSON = path.join(__dirname, "trace-sdk.json");
const TRACE_MMD = path.join(__dirname, "trace-sdk.mmd");

const MODEL = "claude-sonnet-4-6"; // project model lock (CLAUDE.md)
const REQUIRED_TOPICS = ["visual_art", "music", "literature"];

// Tool names as the SDK exposes them. MCP tools are namespaced
// `mcp__<serverKey>__<toolName>`; the serverKey is the key we use in
// options.mcpServers below.
const KB_TOOL = "mcp__kb__search_knowledge_base";
const REPORT_TOOL = "mcp__report__record_report";

// ===================================================================
// Tracer + live dashboard (reused verbatim from the capstone).
// ===================================================================
const tracer = new Tracer();
const LIVE_ENABLED = process.env.LIVE !== "0";
const LIVE_PORT = Number(process.env.LIVE_PORT) || 3737;
let liveServer = null;
if (LIVE_ENABLED) {
  liveServer = startLiveServer(tracer, LIVE_PORT);
  console.log("\n┌──────────────────────────────────────────────────────────────┐");
  console.log(`│  🔭 Live trace dashboard:  http://localhost:${LIVE_PORT}/             │`);
  console.log("│  Open it BEFORE the agents start to watch the full flow.     │");
  console.log("│  (Agent-SDK edition. Skip the server: LIVE=0 npm run …)      │");
  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log("\nStarting agents in 5 seconds...\n");
  await new Promise((r) => setTimeout(r, 5000));
}

// ===================================================================
// State persistence (Module 11.6) — written as each subagent finishes.
// ===================================================================
function loadState() {
  if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  return { started_at: new Date().toISOString(), findings: {}, manifest: {} };
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}
const state = loadState();

// ===================================================================
// Final-report validation (Module 2.4 + 10.4 + 12).
// zod enforces SYNTAX; validateReport enforces SEMANTICS. The
// record_report tool handler runs both and feeds errors back to the
// model for retry — inside the SDK loop.
// ===================================================================
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

function validateReport(report) {
  const errs = [];
  const got = new Set(report.sections.map((s) => s.topic));
  for (const t of REQUIRED_TOPICS) if (!got.has(t)) errs.push(`missing topic: ${t}`);
  for (const s of report.sections) {
    if (s.coverage === "PARTIAL" && !s.coverage_note) {
      errs.push(`section '${s.topic}' is PARTIAL but has no coverage_note`);
    }
    if (s.bullets.length === 0 && s.coverage === "FULL") {
      errs.push(`section '${s.topic}' is FULL but has zero bullets`);
    }
    for (const b of s.bullets) {
      if (!b.source_name) errs.push(`section '${s.topic}': a bullet has no source_name`);
      if (!b.publication_date) errs.push(`section '${s.topic}': a bullet has no publication_date`);
    }
  }
  return errs;
}

// Captured by the record_report tool handler (closure). The structured
// payload is the authoritative output; the agent's prose is secondary.
let capturedReport = null;

const reportServer = createSdkMcpServer({
  name: "report",
  version: "0.1.0",
  tools: [
    tool(
      "record_report",
      "Record the FINAL research report. One section per topic " +
        "(visual_art, music, literature). Each bullet must carry claim, " +
        "source_name, and publication_date copied verbatim from the findings.",
      reportShape,
      async (args) => {
        const errs = validateReport(args);
        if (errs.length > 0) {
          // Retry-with-feedback (Module 2.4): hand the failures back so
          // the synthesizer corrects and calls record_report again.
          return {
            content: [
              {
                type: "text",
                text:
                  "VALIDATION FAILED — fix these and call record_report again:\n- " +
                  errs.join("\n- "),
              },
            ],
            isError: true,
          };
        }
        capturedReport = args;
        return { content: [{ type: "text", text: "Report recorded and validated. ✓" }] };
      },
    ),
  ],
});

// ===================================================================
// Read the kb://catalog RESOURCE once at startup and preload it into the
// coordinator's prompt (Module 4.5). We use a short-lived MCP client for
// this; the Agent SDK spawns its own kb instance for tool calls.
// ===================================================================
async function readCatalog() {
  const transport = new StdioClientTransport({ command: "node", args: [KB_SERVER] });
  const client = new Client({ name: "catalog-reader", version: "0.1.0" }, { capabilities: {} });
  await client.connect(transport);
  try {
    const res = await client.readResource({ uri: "kb://catalog" });
    const text = res.contents.map((c) => c.text).join("\n");
    return text;
  } finally {
    await client.close();
  }
}

// ===================================================================
// Subagent definitions (options.agents) — the REAL AgentDefinition
// shape {description, prompt, tools}. Note `prompt` (not systemPrompt)
// and `tools` (not allowedTools), and the per-agent least-privilege:
// researchers get ONLY the KB tool; the synthesizer gets ONLY
// record_report.
// ===================================================================
function researcher(topic) {
  return {
    description: `Research specialist for the '${topic}' topic.`,
    prompt:
      `You are a research specialist for the '${topic}' topic. Call ` +
      `search_knowledge_base with topic="${topic}". Return a JSON object ` +
      `{ topic, findings: [...] } where each finding is the FULL document ` +
      `you got back — do NOT drop source_name, publication_date, or ` +
      `methodology; they are required downstream. If two documents disagree, ` +
      `return BOTH. If the tool errors, return findings: [] and a note.`,
    tools: [KB_TOOL],
    model: "inherit",
  };
}

const agents = {
  researcher_art: researcher("visual_art"),
  researcher_music: researcher("music"),
  researcher_lit: researcher("literature"),
  synthesizer: {
    description: "Composes the final validated report from researcher findings. No KB access.",
    prompt:
      "You are a research synthesizer. You receive findings from researcher " +
      "subagents (one per topic) inlined in your prompt. Produce the final " +
      "report by calling record_report. Rules:\n" +
      " - One section per topic asked about.\n" +
      " - coverage: FULL if the researcher returned findings; PARTIAL if it " +
      "   returned an empty list or a failure note. If PARTIAL, set coverage_note.\n" +
      " - Each bullet MUST include claim, source_name, publication_date — copy " +
      "   them verbatim from the findings; do NOT invent.\n" +
      " - If two findings on a topic disagree, INCLUDE BOTH with their dates " +
      "   rather than picking one (Module 12 conflict handling).\n" +
      " - If record_report returns a validation error, fix the issues and call " +
      "   it again. Call it until it succeeds.",
    tools: [REPORT_TOOL],
    model: "inherit",
  },
};

// ===================================================================
// THE BRIDGE: translate SDK hook events -> Tracer events the dashboard
// already understands. This is the whole trick that makes the live flow
// work for an SDK-driven run.
//
//   SubagentStart      -> subagent_spawn + agent_start
//   SubagentStop       -> agent_end + subagent_return (+ persist state)
//   PreToolUse         -> tool_call_request   (and auto-approve the call)
//   PostToolUse        -> tool_call_result
//
// The `Agent` / `Task` tools are NOT drawn as tool nodes — the spawn
// arrows come from SubagentStart/Stop instead (same as the dashboard
// hides the hand-rolled `Task` tool).
// ===================================================================
const SKIP_TOOLS = new Set(["Agent", "Task"]);
const toolStartedAt = new Map(); // tool_use_id -> ms
const subStartedAt = new Map(); // agent_id -> ms
const iterByAgent = new Map(); // agent label -> count (best-effort iter #)

// Clean MCP-namespaced tool names for display: mcp__kb__search… -> search…
function cleanToolName(name) {
  return name.startsWith("mcp__") ? name.split("__").pop() : name;
}
function nextIter(label) {
  const n = (iterByAgent.get(label) || 0) + 1;
  iterByAgent.set(label, n);
  return n;
}
const ALLOW = (input) => ({
  hookSpecificOutput: {
    hookEventName: input.hook_event_name,
    permissionDecision: "allow",
    permissionDecisionReason: "auto-approved by capstone harness",
  },
});

const hooks = {
  PreToolUse: [
    {
      hooks: [
        async (input) => {
          const label = input.agent_type || "coordinator";
          if (!SKIP_TOOLS.has(input.tool_name)) {
            toolStartedAt.set(input.tool_use_id, Date.now());
            tracer.toolCallRequest(
              label,
              nextIter(label),
              cleanToolName(input.tool_name),
              input.tool_input,
              input.tool_use_id,
            );
          }
          return ALLOW(input); // headless: never stall on a permission prompt
        },
      ],
    },
  ],
  PostToolUse: [
    {
      hooks: [
        async (input) => {
          if (!SKIP_TOOLS.has(input.tool_name)) {
            const t0 = toolStartedAt.get(input.tool_use_id) || Date.now();
            tracer.toolCallResult(
              input.agent_type || "coordinator",
              iterByAgent.get(input.agent_type || "coordinator") || 1,
              cleanToolName(input.tool_name),
              input.tool_use_id,
              input.tool_response,
              Date.now() - t0,
            );
          }
          return {};
        },
      ],
    },
  ],
  SubagentStart: [
    {
      hooks: [
        async (input) => {
          subStartedAt.set(input.agent_id, Date.now());
          // subagent_spawn draws the yellow coordinator->subagent arrow;
          // agent_start gives the subagent a "running…" card.
          tracer.subagentSpawn("coordinator", input.agent_type, `spawned ${input.agent_type}`);
          tracer.agentStart(input.agent_type, `spawned ${input.agent_type}`);
          return {};
        },
      ],
    },
  ],
  SubagentStop: [
    {
      hooks: [
        async (input) => {
          const t0 = subStartedAt.get(input.agent_id) || Date.now();
          const out = input.last_assistant_message || "(no final message)";
          tracer.agentEnd(input.agent_type, out);
          tracer.subagentReturn("coordinator", input.agent_type, out, Date.now() - t0);
          // State persistence (Module 11.6): record each subagent as it ends.
          state.findings[input.agent_type] = {
            status: "ok",
            output: out,
            ts: new Date().toISOString(),
          };
          state.manifest[input.agent_type] = "completed";
          saveState(state);
          return {};
        },
      ],
    },
  ],
};

// ===================================================================
// MAIN
// ===================================================================
async function main() {
  const catalogText = await readCatalog();

  const coordinatorPrompt =
    "Research how AI is affecting three creative industries: visual art, " +
    "music, and literature. I need every claim backed by a source name and " +
    "a publication date.\n\n" +
    "Do this:\n" +
    " 1. In your FIRST turn, spawn ALL THREE researcher subagents " +
    "(researcher_art, researcher_music, researcher_lit) — issuing them " +
    "together runs them in parallel. Each researches one topic.\n" +
    " 2. When all three return, spawn the synthesizer subagent. Pass it ALL " +
    "the findings verbatim (claims + source_name + publication_date), one " +
    "block per topic. The synthesizer will call record_report.\n" +
    " 3. Return a short markdown summary as your final answer.\n\n" +
    "Topics available in the KB (read from kb://catalog at startup):\n" +
    catalogText;

  // The coordinator is the main-thread agent. Mark it FIRST so the
  // dashboard tags it as the (yellow) coordinator node.
  tracer.agentStart("coordinator", coordinatorPrompt);

  let finalText = "";
  for await (const message of query({
    prompt: coordinatorPrompt,
    options: {
      model: MODEL,
      // Coordinator delegates via the built-in Agent tool; the two MCP
      // tools are auto-approved at the top level too (subagents are
      // covered by the PreToolUse allow hook).
      allowedTools: ["Agent", KB_TOOL, REPORT_TOOL],
      agents,
      mcpServers: {
        kb: { command: "node", args: [KB_SERVER] }, // stdio MCP server
        report: reportServer, // in-process SDK MCP server (record_report)
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

  // ---------------------------------------------------------------
  // Report the outcome + validation status.
  // ---------------------------------------------------------------
  console.log("\n================= FINAL ANSWER =================\n");
  console.log(finalText || "(no final text)");

  console.log("\n================= VALIDATION =================");
  if (!capturedReport) {
    console.log("✗ synthesizer never produced a valid record_report payload.");
  } else {
    const errs = validateReport(capturedReport);
    if (errs.length === 0) {
      console.log("✓ structured report passed schema + semantic validation.");
      for (const s of capturedReport.sections) {
        console.log(`  • ${s.topic}: ${s.coverage}` + (s.coverage_note ? ` — ${s.coverage_note}` : ""));
      }
    } else {
      console.log("✗ residual validation errors:\n- " + errs.join("\n- "));
    }
  }

  // ---------------------------------------------------------------
  // Trace artifacts (kept separate from the hand-rolled capstone's).
  // ---------------------------------------------------------------
  try {
    tracer.writeJSON(TRACE_JSON);
    tracer.writeMermaid(TRACE_MMD);
    tracer.printSummary();
    console.log(`\nTrace written to ${path.basename(TRACE_JSON)} / ${path.basename(TRACE_MMD)}.`);
  } catch (e) {
    console.error("trace write failed:", e.message);
  }

  // ---------------------------------------------------------------
  // Keep the dashboard alive after the run (same UX as the capstone).
  // ---------------------------------------------------------------
  if (liveServer) {
    console.log(`\n🔭 Dashboard still live at http://localhost:${LIVE_PORT}/ — Ctrl+C to stop.`);
    process.on("SIGINT", () => {
      liveServer.close();
      process.exit(0);
    });
    await new Promise(() => {}); // park until Ctrl+C
  }
}

main().catch((err) => {
  console.error("\ncapstone:sdk failed.");
  console.error(
    "This run needs `@anthropic-ai/claude-agent-sdk` installed (npm install), a " +
      "valid ANTHROPIC_API_KEY in .env, and network access (the SDK spawns the " +
      "bundled Claude Code binary as a subprocess).",
  );
  console.error(`\nUnderlying error: ${err?.stack ?? err?.message ?? err}`);
  if (liveServer) liveServer.close();
  process.exit(1);
});
