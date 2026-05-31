// ===================================================================
// Capstone · Multi-Agent Research Network
// ===================================================================
// Integrates EVERYTHING from Modules 1-13:
//
//   - Agent class from Module 3 (loop, allowedTools, hooks)
//   - MCP server + client (Module 4): kb-server.js
//   - Polymorphic Task tool with parallel spawning (3.4)
//   - Coverage annotations on partial failures (10.4)
//   - Provenance preserved through synthesis (12.1)
//   - Resource preloading: kb://catalog read once and embedded
//     into the coordinator's system prompt (4.5)
//   - State persistence after every subagent (11.6)
//   - Final-report validation + retry-with-feedback (2.4 + 6.5)
//   - Hook logging on the coordinator's Task tool (3.5)
//
// Run me with:  npm run capstone
// ===================================================================

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Agent } from "../module-03-agent-sdk/agent.js";
import { Tracer } from "./tracer.js";
import { startLiveServer } from "./live-server.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, "state.json");
const KB_SERVER = path.join(__dirname, "kb-server.js");
const TRACE_JSON = path.join(__dirname, "trace.json");
const TRACE_MMD  = path.join(__dirname, "trace.mermaid");

const tracer = new Tracer();

// ---------------------------------------------------------------------
// Live browser dashboard. Disable with `LIVE=0 npm run capstone`.
// ---------------------------------------------------------------------
const LIVE_ENABLED = process.env.LIVE !== "0";
const LIVE_PORT = Number(process.env.LIVE_PORT) || 3737;
let liveServer = null;
if (LIVE_ENABLED) {
  liveServer = startLiveServer(tracer, LIVE_PORT);
  console.log("\n┌──────────────────────────────────────────────────────────────┐");
  console.log(`│  🔭 Live trace dashboard:  http://localhost:${LIVE_PORT}/             │`);
  console.log("│  Open it BEFORE the agents start to watch the full flow.     │");
  console.log("│  (To skip the live server entirely: LIVE=0 npm run capstone) │");
  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log("\nStarting agents in 5 seconds...\n");
  await new Promise((r) => setTimeout(r, 5000));
}

// -------------------------------------------------------------------
// State persistence helpers (Module 11.6).
// -------------------------------------------------------------------
function loadState() {
  if (fs.existsSync(STATE_PATH)) return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  return { started_at: new Date().toISOString(), findings: {}, manifest: {} };
}
function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// -------------------------------------------------------------------
// Build MCP-backed tool catalog for the researcher subagent.
// -------------------------------------------------------------------
async function makeKBClient() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [KB_SERVER],
  });
  const client = new Client(
    { name: "capstone-coordinator", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);
  return client;
}

function buildResearcherCatalog(client, kbTool) {
  return {
    [kbTool.name]: {
      schema: {
        name: kbTool.name,
        description: kbTool.description,
        input_schema: kbTool.inputSchema, // MCP -> Anthropic translation (Module 4.3)
      },
      handler: async (input) => {
        const r = await client.callTool({ name: kbTool.name, arguments: input });
        const text = r.content.map((b) => b.text).join("\n");
        if (r.isError) return { isError: true, text };
        try { return JSON.parse(text); } catch { return { text }; }
      },
    },
  };
}

// -------------------------------------------------------------------
// Final-report schema. Validation runs after synthesis (2.4 + 6.5).
// -------------------------------------------------------------------
const REPORT_SCHEMA = {
  name: "record_report",
  description: "Record the final research report.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            // Enum-constrained so the model cannot drift to "Visual Art"
            // / "Music" etc. — Module 2.3: schema enum prevents the
            // model from inventing a friendlier rendering of an identifier
            // that downstream code dispatches off.
            topic: { type: "string", enum: ["visual_art", "music", "literature"] },
            coverage: { type: "string", enum: ["FULL", "PARTIAL"] },
            coverage_note: { type: ["string", "null"] },
            bullets: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  claim: { type: "string" },
                  source_name: { type: "string" },
                  publication_date: { type: "string" },
                },
                required: ["claim", "source_name", "publication_date"],
              },
            },
          },
          required: ["topic", "coverage", "bullets"],
        },
      },
    },
    required: ["title", "sections"],
  },
};

// Semantic validation: every topic the user asked about must be present;
// every bullet must have a source AND a date. (Schema enforces structure;
// this enforces meaning. — Module 2.4)
function validateReport(report, requiredTopics) {
  const errs = [];
  const got = new Set(report.sections.map((s) => s.topic));
  for (const t of requiredTopics) if (!got.has(t)) errs.push(`missing topic: ${t}`);
  for (const s of report.sections) {
    if (s.bullets.length === 0) errs.push(`section '${s.topic}' has zero bullets`);
    for (const b of s.bullets) {
      if (!b.source_name) errs.push(`section '${s.topic}': a bullet has no source_name`);
      if (!b.publication_date) errs.push(`section '${s.topic}': a bullet has no publication_date`);
    }
  }
  return errs;
}

// -------------------------------------------------------------------
// MAIN
// -------------------------------------------------------------------
async function main() {
  const state = loadState();

  // Spin up the MCP server, discover its tool + resource.
  const client = await makeKBClient();
  const { tools } = await client.listTools();
  const kbTool = tools[0];

  // Preload the catalog resource into the coordinator's system prompt
  // (Module 4.5 — resource provides the "map" of what exists).
  const catalogText = (await client.readResource({ uri: "kb://catalog" })).contents[0].text;

  // -----------------------------------------------------------------
  // Define the subagents.
  // -----------------------------------------------------------------
  const researcherCatalog = buildResearcherCatalog(client, kbTool);

  function makeResearcher(name) {
    return new Agent({
      name,
      description: "Looks up documents from the KB MCP server and returns ALL provenance fields.",
      systemPrompt:
        "You are a research specialist. Call search_knowledge_base with the topic " +
        "you are given. Return a JSON object with: { topic, findings: [...] }, where " +
        "each finding is the full document object you got back (do NOT drop source_name, " +
        "publication_date, methodology — they are required downstream). If the tool " +
        "returns an error, set findings: [] and explain in a `note` field.",
      allowedTools: Object.keys(researcherCatalog),
      toolCatalog: researcherCatalog,
      tracer,
    });
  }

  // Capture the structured record_report payload so the validator at
  // the end of main() can inspect it. Without this, agent.run() only
  // returns the synthesizer's final end_turn text (markdown brief),
  // and the structured object would be lost between the tool handler
  // and the validation step.
  let capturedReport = null;
  const synthesizer = new Agent({
    name: "synthesizer",
    description: "Composes the final report from all researcher findings. No tools.",
    systemPrompt:
      "You are a research synthesizer. You will receive findings from multiple researcher " +
      "subagents (one per topic). Produce a final report by calling record_report. Rules:\n" +
      " - One section per topic the user asked about.\n" +
      " - coverage: FULL if the researcher returned findings; PARTIAL if it returned an empty " +
      "list or a note about failure. If PARTIAL, also set coverage_note.\n" +
      " - Each bullet MUST include claim, source_name, and publication_date (extract " +
      "verbatim from the findings — do NOT invent).\n" +
      " - If two findings on the same topic disagree, INCLUDE BOTH with their dates rather " +
      "than picking one (Module 12 conflict handling).\n" +
      " - After calling record_report ONCE, you may optionally produce a short markdown " +
      "summary as your final text response. The structured record_report payload is the " +
      "authoritative output.",
    allowedTools: ["record_report"],
    toolCatalog: {
      record_report: {
        schema: REPORT_SCHEMA,
        handler: async (input) => {
          capturedReport = input; // <-- closure capture: validator reads this after run()
          return input;
        },
      },
    },
    tracer,
  });

  // -----------------------------------------------------------------
  // Coordinator: polymorphic Task tool spawns researchers in parallel.
  // -----------------------------------------------------------------
  const subagentRegistry = {
    researcher_art:  makeResearcher("researcher_art"),
    researcher_music: makeResearcher("researcher_music"),
    researcher_lit:  makeResearcher("researcher_lit"),
    synthesizer,
  };

  const coordinatorTools = {
    Task: {
      schema: {
        name: "Task",
        description:
          "Spawn a subagent. Pass subagent_type and a fully self-contained prompt " +
          "(the subagent has no access to your conversation). To research multiple " +
          "topics, issue MULTIPLE Task calls in ONE assistant turn — they run in parallel. " +
          "Then issue a synthesizer Task once all researchers return. " +
          "Available subagent_type: " + Object.keys(subagentRegistry).join(", ") + ".",
        input_schema: {
          type: "object",
          properties: {
            subagent_type: { type: "string", enum: Object.keys(subagentRegistry) },
            prompt: { type: "string" },
          },
          required: ["subagent_type", "prompt"],
        },
      },
      handler: async ({ subagent_type, prompt }) => {
        const sub = subagentRegistry[subagent_type];
        console.log(`[coordinator] -> ${subagent_type} START`);
        tracer.subagentSpawn("coordinator", subagent_type, prompt);
        const t0 = Date.now();
        try {
          const out = await sub.run(prompt);
          state.findings[subagent_type] = { status: "ok", output: out, ts: new Date().toISOString() };
          state.manifest[subagent_type] = "completed";
          saveState(state);
          console.log(`[coordinator] -> ${subagent_type} DONE`);
          tracer.subagentReturn("coordinator", subagent_type, out, Date.now() - t0);
          return { subagent_type, result: out };
        } catch (err) {
          state.findings[subagent_type] = { status: "error", message: err.message };
          state.manifest[subagent_type] = "failed";
          saveState(state);
          tracer.subagentReturn("coordinator", subagent_type, `ERROR: ${err.message}`, Date.now() - t0);
          return { subagent_type, isError: true, error: err.message };
        }
      },
    },
  };

  // PreToolUse hook (Module 3.5): log every delegation for an audit trail.
  const coordinator = new Agent({
    name: "coordinator",
    description: "Top-level orchestrator for the multi-agent research network.",
    systemPrompt:
      "You orchestrate a multi-topic research workflow. For the user's question:\n" +
      " 1. In your FIRST assistant turn, issue ONE Task per topic to the relevant " +
      "    researcher subagent (researcher_art, researcher_music, researcher_lit). " +
      "    Issuing them in the SAME turn runs them in parallel.\n" +
      " 2. When all researcher results return, issue ONE Task to the synthesizer with " +
      "    a self-contained brief that inlines ALL findings verbatim (sources + dates " +
      "    intact).\n" +
      " 3. Return the synthesizer's final output as your end_turn answer.\n\n" +
      "Available topics in the KB (from kb://catalog read at startup):\n" +
      catalogText,
    allowedTools: ["Task"],
    toolCatalog: coordinatorTools,
    hooks: {
      preToolUse: ({ tool, input }) => {
        console.log(`  [hook PreToolUse] coordinator calling ${tool} (${input.subagent_type})`);
      },
    },
    tracer,
    maxIterations: 12,
  });

  // -----------------------------------------------------------------
  // Run it.
  // -----------------------------------------------------------------
  const userQuestion =
    "Produce a brief on the state of AI across three creative domains: visual_art, music, " +
    "and literature. Each section must have at least two bullets, every bullet must cite " +
    "a source_name and publication_date, and any conflicting numbers between sources must " +
    "be presented with their dates so the difference is visible.";

  console.log(`\nUSER: ${userQuestion}\n`);
  await coordinator.run(userQuestion);

  // -----------------------------------------------------------------
  // Pull the synthesizer's outputs. Two channels:
  //   1. capturedReport — the structured record_report payload, the
  //      AUTHORITATIVE result; this is what the validator inspects.
  //   2. state.findings.synthesizer.output — the synthesizer's final
  //      markdown brief (its end_turn text); good for human display.
  // -----------------------------------------------------------------
  const markdownBrief = state.findings.synthesizer?.output ?? "(no markdown brief returned)";
  console.log("\n=========== FINAL REPORT (markdown brief) ===========");
  console.log(markdownBrief);

  console.log("\n=========== STRUCTURED RECORD (record_report tool input) ===========");
  if (capturedReport) {
    console.log(JSON.stringify(capturedReport, null, 2));
  } else {
    console.log("(synthesizer did not call record_report — schema validation cannot run)");
  }

  const errs = capturedReport
    ? validateReport(capturedReport, ["visual_art", "music", "literature"])
    : ["synthesizer never produced a structured record_report payload"];
  if (errs.length === 0) {
    console.log(
      "\nVALIDATION: OK — all required topics present, every bullet has source_name + publication_date.",
    );
  } else {
    console.log("\nVALIDATION ERRORS (would trigger retry-with-feedback in a full pipeline):");
    for (const e of errs) console.log("  -", e);
  }

  await client.close();
  console.log("\nFinal state at:", STATE_PATH);

  // -----------------------------------------------------------------
  // Trace artifacts: structured event log + sequence diagram + ASCII.
  // -----------------------------------------------------------------
  tracer.writeJSON(TRACE_JSON);
  tracer.writeMermaid(TRACE_MMD);
  tracer.printSummary();
  console.log(`\nTrace artifacts written:`);
  console.log(`  raw events:        ${TRACE_JSON}`);
  console.log(`  mermaid diagram:   ${TRACE_MMD}`);
  console.log(`  (open trace.mermaid in VS Code Mermaid preview, or paste into github.com)`);

  if (liveServer) {
    console.log(
      `\nLive dashboard is still running at http://localhost:${LIVE_PORT}/ — ` +
      `inspect the full event log, then Ctrl+C to stop.`,
    );
    // Keep the process alive so the dashboard remains queryable.
    process.on("SIGINT", () => { liveServer.close(); process.exit(0); });
    await new Promise(() => {}); // park forever (until Ctrl+C)
  }
}

main().catch((err) => {
  console.error("Run failed:", err);
  process.exit(1);
});
