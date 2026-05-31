// ===================================================================
// Module 11 · Concepts 11.1–11.6 — Context Management in Production
// ===================================================================
// Six techniques, all addressing different facets of context bloat:
//
//   11.1 FACT BLOCK — extract key facts into a structured block;
//        include it in every prompt regardless of how history is
//        summarized. Survives /compact (Module 5.5).
//
//   11.2 TRIM TOOL RESULTS — PostToolUse hook keeps only the relevant
//        fields. You measured this in Module 1.6.
//
//   11.3 POSITION-AWARE INPUT — put critical info at the START or END
//        of long inputs; the middle is where things get missed.
//
//   11.4 SCRATCHPAD FILES — write durable findings to disk; reload
//        in future sessions instead of re-discovering.
//
//   11.5 DELEGATE TO SUBAGENTS — let a subagent read 15 files and
//        return one line; the main agent never sees the 15 files.
//
//   11.6 STRUCTURED STATE PERSISTENCE — each agent serializes its
//        state to a known location after each subtask; coordinator
//        loads a manifest on resume. Lets you survive crashes.
//
// THIS DEMO exercises 11.4 (scratchpad) and 11.6 (state persistence)
// together. We run a "researcher" that processes 5 items, writes its
// progress to a JSON state file after EACH item, then we SIMULATE A
// CRASH by exiting mid-way and re-running — the second run reads the
// state file and CONTINUES from where the first left off, instead of
// re-doing the completed items.
//
// Run me TWICE:
//   npm run m11:state          # first run — crashes after 3 items
//   npm run m11:state -- -r    # second run — resumes from item 4
// ===================================================================

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_PATH = path.join(__dirname, "researcher-state.json");

const ITEMS = [
  { id: "topic-1", q: "In one sentence, what is the Anthropic Messages API?" },
  { id: "topic-2", q: "In one sentence, what is MCP?" },
  { id: "topic-3", q: "In one sentence, what is the Agent SDK?" },
  { id: "topic-4", q: "In one sentence, what does prompt chaining solve?" },
  { id: "topic-5", q: "In one sentence, what is self-correction?" },
];

const RESUME = process.argv.includes("-r");

function loadState() {
  if (fs.existsSync(STATE_PATH)) {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  }
  return { status: "in_progress", completed: {}, started_at: new Date().toISOString() };
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

async function answerOne(question) {
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 150,
    system: "Answer in ONE concise sentence.",
    messages: [{ role: "user", content: question }],
  });
  return res.content[0].text;
}

async function main() {
  if (RESUME) {
    if (!fs.existsSync(STATE_PATH)) {
      console.log("No state file found — run without -r first.");
      return;
    }
    console.log("Resuming from persisted state...");
  } else if (fs.existsSync(STATE_PATH)) {
    console.log("Found existing state file. Removing it for a fresh run.");
    fs.unlinkSync(STATE_PATH);
  }

  const state = loadState();
  console.log(`Items already completed: ${Object.keys(state.completed).length}/${ITEMS.length}`);

  for (let i = 0; i < ITEMS.length; i++) {
    const item = ITEMS[i];
    if (state.completed[item.id]) {
      console.log(`[skip]   ${item.id} — already done`);
      continue;
    }
    console.log(`[work]   ${item.id}: ${item.q}`);
    const answer = await answerOne(item.q);
    state.completed[item.id] = { answer, finished_at: new Date().toISOString() };
    saveState(state); // <-- persist after EACH item; this is 11.6 in action
    console.log(`          -> ${answer}`);

    // Simulate a crash after the 3rd item on the FIRST run.
    if (!RESUME && i === 2) {
      console.log("\n*** Simulated crash. State has been persisted to:");
      console.log("   " + STATE_PATH);
      console.log("Re-run with `-- -r` to resume from item 4.");
      process.exit(0);
    }
  }

  state.status = "completed";
  state.finished_at = new Date().toISOString();
  saveState(state);
  console.log("\nALL ITEMS COMPLETED. Final state written to:");
  console.log("  " + STATE_PATH);
  console.log("\nObserve: the second run skipped topic-1..3 (already in state file)");
  console.log("and only did topic-4 and topic-5. Crash recovery in <100 lines.");
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
