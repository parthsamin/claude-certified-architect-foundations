// ===================================================================
// Module 6 · Concept 6.1 (b) — Few-shot where it DRAMATICALLY matters
// ===================================================================
// The 01-few-shot.js demo was muted because the schema's enum +
// descriptions did most of the work. This file picks a task where
// the schema CANNOT encode the convention — the convention is a
// team-specific ROUTING RULE — and few-shot is the only thing that
// teaches it.
//
// TASK: classify bug reports into our team's P0/P1/P2/P3 scheme.
//
// Team convention (no schema can express this):
//   P0 = production CRASH or DATA LOSS                 -> drop everything
//   P1 = SECURITY vulnerability                        -> same-week fix
//   P2 = FUNCTIONAL bug, workaround exists             -> same-sprint
//   P3 = UI / COSMETIC issue                           -> backlog
//
// Schema deliberately has NO enum on `priority` — the model is free to
// drift to "critical / high / medium / low", "urgent / normal", or
// guess between P-numbers based on its own intuition. Few-shot will
// lock the labels AND the routing logic.
//
// Run me with:  npm run m6:classify
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tool = {
  name: "classify_bug",
  description: "Record the priority classification of a bug report.",
  input_schema: {
    type: "object",
    properties: {
      priority: { type: "string", description: "Priority label" },
      reason:   { type: "string", description: "Brief justification" },
    },
    required: ["priority", "reason"],
  },
};

// Few-shot examples that teach BOTH the labels AND the routing rules.
const FEW_SHOT = `Examples (use these EXACT labels):

Bug: "Payment service throws OutOfMemoryError under production load and crashes."
-> { "priority": "P0", "reason": "Production crash — P0." }

Bug: "Customer passwords are written to stderr in plaintext."
-> { "priority": "P1", "reason": "Security: secret leakage — P1." }

Bug: "Search returns wrong results when the query contains an apostrophe; users can escape with quotes."
-> { "priority": "P2", "reason": "Functional bug with a workaround — P2." }

Bug: "Primary CTA button uses #336699 instead of brand color #3366FF."
-> { "priority": "P3", "reason": "Cosmetic / UI — P3." }
`;

const TEST_BUGS = [
  "App crashes when a user clicks the Export button.",
  "Login modal is misaligned by 2px on iPhone SE.",
  "The /orders POST endpoint returns 500 when the body is empty.",
  "User session tokens are stored in plaintext in CloudWatch logs.",
  "After a service restart, all rows in the carts table are wiped.",
];

async function classify(useFewShot, bug) {
  const system = useFewShot
    ? `You triage bug reports for our team. ${FEW_SHOT}\nClassify the next bug using the same labels and the same logic.`
    : `You triage bug reports. Classify each bug by priority and explain.`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: "classify_bug" },
    messages: [{ role: "user", content: `Bug: "${bug}"` }],
  });
  return res.content.find((b) => b.type === "tool_use").input;
}

async function main() {
  console.log("\n  Schema has NO enum on `priority` — the model can label freely.");
  console.log("  Few-shot teaches BOTH the labels (P0..P3) AND the routing rules.\n");

  for (const bug of TEST_BUGS) {
    console.log(`=== Bug: "${bug.slice(0, 70)}..." ===`);
    const zero = await classify(false, bug);
    console.log(`  [zero-shot]  priority=${JSON.stringify(zero.priority).padEnd(14)} reason: ${zero.reason}`);
    const few = await classify(true, bug);
    console.log(`  [few-shot]   priority=${JSON.stringify(few.priority).padEnd(14)} reason: ${few.reason}`);
    console.log();
  }

  console.log("Read the [zero-shot] column: the labels probably drift between schemes");
  console.log("(critical / high / medium / low — or P0/P1/P2/P3 with different routing");
  console.log("than ours). The [few-shot] column should consistently use P0..P3 AND");
  console.log("match our specific 'P0=crash/data-loss, P1=security' routing.");
  console.log();
  console.log("Lesson: when the convention is a TEAM RULE the schema cannot encode,");
  console.log("few-shot is the only thing that teaches it.");
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
