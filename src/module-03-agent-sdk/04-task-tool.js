// ===================================================================
// Module 3 · Concept 3.4 — The Task Tool, Context Passing, Parallel
// ===================================================================
// Concept 3.3 had a separate dispatch tool per subagent
// (ask_researcher, ask_writer). The Agent SDK GENERALIZES that into
// ONE polymorphic tool called `Task`:
//
//     Task({ subagent_type: "researcher", prompt: "..." })
//
// One tool, any number of subagent types. The coordinator's
// `allowed_tools` must include "Task" — that's how the guide phrases
// it. The Task handler routes to the right subagent based on
// subagent_type. This is the canonical hub-and-spoke implementation.
//
// THREE things the exam tests here:
//
// (1) EXPLICIT CONTEXT PASSING — mandatory.
//     The subagent has ISOLATED context. It does NOT see the
//     coordinator's history. Everything it needs must be in the
//     `prompt` argument.
//
//     X  Bad:  Task("researcher", "Analyze the document")
//             -> subagent has no document, no source, nothing.
//
//     ✓  Good: Task("researcher", `
//             Analyze the following document.
//             Document: <full text>
//             Prior search results: <results>
//             Output format requirements: <schema>`)
//
// (2) PARALLEL SPAWNING.
//     A coordinator's single assistant turn can contain MULTIPLE
//     tool_use blocks. When all those blocks are Task calls, those
//     subagents run CONCURRENTLY (we use Promise.all in agent.js).
//     Use this whenever subtasks are independent — e.g. "research
//     topic A" and "research topic B" can happen in parallel; only
//     synthesis must wait for both.
//
// (3) THE HANDOFF BACK.
//     Each subagent's final end_turn text becomes the content of a
//     tool_result block tagged to its tool_use_id, returned to the
//     coordinator on its NEXT iteration. The coordinator then sees
//     all subagent results in its context and reasons over them.
//
// In this demo: the user asks for a comparison between TWO topics.
// The coordinator should fire two Task(researcher, ...) calls in ONE
// turn so they run in parallel, then a Task(writer, ...) with both
// findings stitched in. We log timestamps to make the overlap visible.
//
// Run me with:  npm run m3:task
// ===================================================================

import { Agent } from "./agent.js";
import { tracer, finalizeTracing } from "../lib/optional-tracer.js";

const t0 = Date.now();
const stamp = () => `t+${((Date.now() - t0) / 1000).toFixed(2)}s`;

// -------------------------------------------------------------------
// The docs the researcher can look up.
// -------------------------------------------------------------------
const DOCS = {
  "stop_reason tool_use": [
    "When stop_reason='tool_use', the model has paused to request a tool call.",
    "Your application must run the requested tool, append the tool_result to history as a user turn, and re-call the API to continue.",
  ].join(" "),
  "stop_reason end_turn": [
    "When stop_reason='end_turn', the model has finished its response naturally.",
    "Your application should show the result to the user and exit the agent loop. No further API call is needed.",
  ].join(" "),
};

// -------------------------------------------------------------------
// Subagents (researcher with a doc tool, writer with no tools).
// -------------------------------------------------------------------
const RESEARCHER_TOOLS = {
  get_doc: {
    schema: {
      name: "get_doc",
      description: "Look up an internal doc snippet by topic phrase. Returns the doc text.",
      input_schema: {
        type: "object",
        properties: { topic: { type: "string" } },
        required: ["topic"],
      },
    },
    handler: ({ topic }) => {
      const key = topic.toLowerCase();
      const hit =
        DOCS[key] ??
        Object.entries(DOCS).find(([k]) => k.split(" ").every((tok) => key.includes(tok)))?.[1];
      return { text: hit ?? "no doc found" };
    },
  },
};

const researcherAgent = new Agent({
  name: "researcher",
  description: "Looks up documentation and returns relevant facts.",
  systemPrompt: "You are a research specialist. Use get_doc, then return ONLY the facts.",
  allowedTools: ["get_doc"],
  toolCatalog: RESEARCHER_TOOLS,
  tracer,
});

const writerAgent = new Agent({
  name: "writer",
  description: "Synthesizes raw findings into a polished, formatted answer.",
  systemPrompt:
    "You are a technical writer. Use ONLY the facts in the brief; do not invent. Match the requested format exactly.",
  allowedTools: [],
  toolCatalog: {},
  tracer,
});

// -------------------------------------------------------------------
// THE COORDINATOR with a single, polymorphic `Task` tool.
// subagent_type ROUTES to the right Agent.
// -------------------------------------------------------------------
const SUBAGENT_REGISTRY = {
  researcher: researcherAgent,
  writer: writerAgent,
};

const COORDINATOR_TOOLS = {
  Task: {
    schema: {
      name: "Task",
      description:
        "Spawn a subagent to do focused work. Pass the subagent_type " +
        "AND a fully self-contained prompt — the subagent has NO " +
        "access to your conversation or prior subagent results, so " +
        "every fact and instruction must be inlined here. " +
        "You may call Task multiple times in one turn; those calls " +
        "run in parallel — use this for independent subtasks. " +
        "Available subagent_type values: " +
        Object.entries(SUBAGENT_REGISTRY)
          .map(([k, a]) => `'${k}' (${a.description})`)
          .join("; ") +
        ".",
      input_schema: {
        type: "object",
        properties: {
          subagent_type: { type: "string", enum: Object.keys(SUBAGENT_REGISTRY) },
          prompt: { type: "string", description: "Self-contained task with all needed context inlined" },
        },
        required: ["subagent_type", "prompt"],
      },
    },
    handler: async ({ subagent_type, prompt }) => {
      const sub = SUBAGENT_REGISTRY[subagent_type];
      if (!sub) return { error: `unknown subagent_type: ${subagent_type}` };
      console.log(`   [${stamp()}] Task -> ${subagent_type} START`);
      const t0 = Date.now();
      if (tracer) tracer.subagentSpawn("coordinator", subagent_type, prompt);
      const result = await sub.run(prompt);
      if (tracer) tracer.subagentReturn("coordinator", subagent_type, result, Date.now() - t0);
      console.log(`   [${stamp()}] Task -> ${subagent_type} DONE`);
      return { subagent_type, result };
    },
  },
};

const coordinatorAgent = new Agent({
  name: "coordinator",
  description: "Orchestrator. Decomposes, spawns subagents via Task, aggregates, communicates.",
  systemPrompt:
    "You are a coordinator. Decompose the user's request, then call the Task tool to delegate. " +
    "Independent subtasks should be requested in the SAME assistant turn so they run in parallel. " +
    "Always include all the context the subagent needs inside the Task prompt — the subagent " +
    "cannot see anything outside of what you pass it. Finalize with a Task call to the writer " +
    "that includes the writer's brief AND all source facts.",
  allowedTools: ["Task"],
  toolCatalog: COORDINATOR_TOOLS,
  tracer,
});

async function main() {
  const userQuestion =
    "Compare what an agent should do when Claude's stop_reason is 'tool_use' versus when " +
    "it is 'end_turn'. Produce a clean 3-bullet markdown comparison.";

  console.log(`USER (at ${stamp()}): ${userQuestion}\n`);
  console.log("--- coordinator orchestrating ---");
  const final = await coordinatorAgent.run(userQuestion);
  console.log("\n=== FINAL ANSWER ===\n" + final);
  console.log(
    "\nWatch the timestamps: if the two researcher Task calls overlap, parallel spawning worked.",
  );

  await finalizeTracing();
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
