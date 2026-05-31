// ===================================================================
// Module 3 · Concept 3.3 — Hub-and-Spoke (Coordinator + Subagents)
// ===================================================================
// Multi-agent systems are built as HUB-AND-SPOKE topology:
//
//                    COORDINATOR
//                  /     |      \
//             Subagent  Subagent  Subagent
//             (research) (analysis) (writer)
//
// THE COORDINATOR'S JOB (six things — memorize these):
//   1. DECOMPOSE   break the task into subtasks
//   2. DECIDE      pick which subagents are needed (dynamic — model-driven)
//   3. DELEGATE    invoke each subagent with the EXACT context it needs
//   4. AGGREGATE   collect the subagent results
//   5. VALIDATE    sanity-check / cross-check the results
//   6. COMMUNICATE return one synthesized answer to the user
//
// THE SUBAGENT'S JOB:
//   - Focus on ONE narrow task with its own systemPrompt and tools
//   - Has ISOLATED CONTEXT — does NOT inherit the coordinator's history
//   - Returns a single result; that's it
//
// CRITICAL PRINCIPLE (exam-tested often):
//   *Subagents have isolated context.* They do not see the coordinator's
//   conversation. They do not share memory across calls. Whatever the
//   subagent needs must be EXPLICITLY PASSED in its prompt. All
//   communication routes through the coordinator. (You'll see this
//   enforced in code: each subagent.run() gets a fresh messages array.)
//
// WHY THE TOPOLOGY EXISTS:
//   - OBSERVABILITY — one place to log every delegation and result
//   - ERROR CONTROL — coordinator decides what to do when a subagent fails
//   - SYNTHESIS    — exactly one component reasons over all results
//   - CONTEXT HYGIENE — subagents do not pollute each other's windows
//
// The pattern in this file: the coordinator is itself an Agent whose
// TOOLS are "ask_<subagent>(prompt)" — calling one of those tools is
// equivalent to delegating. Concept 3.4 will generalize this into a
// single Task tool with parallel spawning.
//
// Run me with:  npm run m3:coord
// ===================================================================

import { Agent } from "./agent.js";
import { tracer, finalizeTracing } from "../lib/optional-tracer.js";

// -------------------------------------------------------------------
// A mock "knowledge base" for the researcher to look things up in.
// -------------------------------------------------------------------
const DOCS = {
  "claude messages api stop_reason tool_use": [
    "When stop_reason is 'tool_use', the model has paused and is requesting a tool call.",
    "Your application must execute the requested tool, append the tool_result inside a user-role turn, and call the API again so the model can continue.",
    "The agentic loop continues until stop_reason becomes 'end_turn'.",
  ].join(" "),
};

// -------------------------------------------------------------------
// Subagent tool catalogs.
// Researcher gets a doc-lookup tool. Writer gets no tools at all —
// it just formats whatever the coordinator hands it.
// -------------------------------------------------------------------
const RESEARCHER_TOOLS = {
  get_doc: {
    schema: {
      name: "get_doc",
      description:
        "Look up an internal documentation snippet by a short topic query. " +
        "Returns the relevant doc text. Use to gather facts before answering.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    handler: ({ query }) => {
      const key = query.toLowerCase();
      // crude exact-then-fuzzy match
      const found =
        DOCS[key] ??
        Object.entries(DOCS).find(([k]) =>
          k.split(" ").every((tok) => key.includes(tok)),
        )?.[1];
      return found ? { text: found } : { text: "no doc found for that query" };
    },
  },
};

// -------------------------------------------------------------------
// Define each SUBAGENT with its own narrow systemPrompt + allowedTools.
// -------------------------------------------------------------------
const researcherAgent = new Agent({
  name: "researcher",
  description: "Looks up internal documentation and returns the relevant facts.",
  systemPrompt:
    "You are a research specialist. Call get_doc to find the relevant " +
    "documentation, then return ONLY the factual content you found. " +
    "Do not editorialize or format.",
  allowedTools: ["get_doc"],
  toolCatalog: RESEARCHER_TOOLS,
  tracer,
});

const writerAgent = new Agent({
  name: "writer",
  description: "Rewrites raw research findings as a clean, concise answer.",
  systemPrompt:
    "You are a technical writer. You will receive a brief and raw facts. " +
    "Produce a polished answer in the exact format the brief asks for. " +
    "Use ONLY the facts provided — do not invent.",
  allowedTools: [],         // no tools — pure reasoning
  toolCatalog: {},
  tracer,
});

// -------------------------------------------------------------------
// THE COORDINATOR. It is an Agent whose tools are DELEGATION tools —
// each tool, when "called" by the model, invokes a subagent.
//
// Note the handler signature: it takes a `prompt` and calls
// subagent.run(prompt). The coordinator MUST put everything the
// subagent needs into that prompt — the subagent's history starts
// empty (look at Agent.run — `const messages = [{ role: "user", ... }]`).
// -------------------------------------------------------------------
const COORDINATOR_TOOLS = {
  ask_researcher: {
    schema: {
      name: "ask_researcher",
      description:
        "Delegate a focused research question to the researcher subagent. " +
        "The researcher has no context other than this prompt — include " +
        "everything it needs.",
      input_schema: {
        type: "object",
        properties: { prompt: { type: "string", description: "Standalone research task" } },
        required: ["prompt"],
      },
    },
    handler: async ({ prompt }) => {
      console.log(`   [coordinator -> researcher]  delegating...`);
      const t0 = Date.now();
      if (tracer) tracer.subagentSpawn("coordinator", "researcher", prompt);
      const out = await researcherAgent.run(prompt);
      if (tracer) tracer.subagentReturn("coordinator", "researcher", out, Date.now() - t0);
      return { result: out };
    },
  },
  ask_writer: {
    schema: {
      name: "ask_writer",
      description:
        "Delegate a write-up task to the writer subagent. The writer has " +
        "no context — include the brief AND any source facts in this prompt.",
      input_schema: {
        type: "object",
        properties: { prompt: { type: "string", description: "Standalone brief + facts" } },
        required: ["prompt"],
      },
    },
    handler: async ({ prompt }) => {
      console.log(`   [coordinator -> writer]      delegating...`);
      const t0 = Date.now();
      if (tracer) tracer.subagentSpawn("coordinator", "writer", prompt);
      const out = await writerAgent.run(prompt);
      if (tracer) tracer.subagentReturn("coordinator", "writer", out, Date.now() - t0);
      return { result: out };
    },
  },
};

const coordinatorAgent = new Agent({
  name: "coordinator",
  description: "Top-level orchestrator. Decomposes tasks and delegates to subagents.",
  systemPrompt:
    "You are a coordinator. For each user request: " +
    "(1) decompose into subtasks; " +
    "(2) call ask_researcher to gather facts (pass an EXPLICIT, standalone prompt); " +
    "(3) call ask_writer with the facts plus a format brief; " +
    "(4) return the writer's output as your final answer.",
  allowedTools: ["ask_researcher", "ask_writer"],
  toolCatalog: COORDINATOR_TOOLS,
  tracer,
});

async function main() {
  const userQuestion =
    "Explain in two sentences what an agent should do when the Claude Messages " +
    "API returns stop_reason='tool_use'.";

  console.log("\nUSER:", userQuestion);
  console.log("\n--- Coordinator orchestrating ---");
  const final = await coordinatorAgent.run(userQuestion);
  console.log("\n=== FINAL ANSWER ===\n" + final);

  console.log("\nObserve in the logs above:");
  console.log("  - Coordinator delegated to researcher, then writer (or in some order)");
  console.log("  - Each subagent started with a FRESH messages array (isolated context)");
  console.log("  - Coordinator was the ONLY component that saw all of it.");

  await finalizeTracing();
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
