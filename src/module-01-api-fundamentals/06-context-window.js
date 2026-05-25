// ===================================================================
// Module 1 · Concept 1.6 — The Context Window
// ===================================================================
// The context window = ALL tokens the model processes in one request:
//   system prompt + every message + tool definitions + tool results.
// It is finite. Three classic failure modes:
//
//   1. Lost-in-the-middle  — facts buried in the MIDDLE of long input
//                            get missed; start & end are recalled best.
//   2. Tool-result bloat   — a tool returns 40 fields, 5 matter; the
//                            other 35 sit in context forever, wasted.
//   3. Progressive summary — compressing history loses exact numbers,
//                            %, and dates ("about", "roughly", "a few").
//
// This exercise MEASURES failure mode #2: we answer the SAME question
// twice — once with a bloated tool result, once trimmed — and compare
// the input_tokens the model has to process on the next API trip.
//
// Run me with:  npm run m1:context
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools = [
  {
    name: "get_customer",
    description: "Look up a customer profile by email. Returns account details.",
    input_schema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
  },
];

// -------------------------------------------------------------------
// The FAT result — what a raw backend/CRM API often dumps: 40+ fields,
// most irrelevant to "is this account in good standing?".
// -------------------------------------------------------------------
function fatCustomerRecord() {
  const rec = {
    name: "Jane Doe",
    email: "jane@example.com",
    account_status: "good_standing",
    plan: "pro",
    balance_due: 0,
  };
  // ...plus 35 fields of noise the question does NOT need.
  for (let i = 1; i <= 35; i++) {
    rec[`misc_field_${i}`] =
      "lorem ipsum dolor sit amet consectetur adipiscing elit " +
      "sed do eiusmod tempor incididunt ut labore et dolore magna";
  }
  return rec;
}

// -------------------------------------------------------------------
// The TRIMMED result — only the 5 fields the question actually needs.
// This is mitigation #2: trim tool output BEFORE it enters context.
// -------------------------------------------------------------------
function trimCustomerRecord(fat) {
  const { name, email, account_status, plan, balance_due } = fat;
  return { name, email, account_status, plan, balance_due };
}

// Runs the loop; returns the input_tokens of the FINAL API trip
// (the trip where the tool result is already sitting in context).
async function runAgent(mode) {
  const messages = [
    { role: "user", content: "Is jane@example.com's account in good standing?" },
  ];
  let lastInputTokens = 0;

  while (true) {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: "You are a support assistant. Answer briefly.",
      tools,
      messages,
    });
    lastInputTokens = res.usage.input_tokens;
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      return lastInputTokens;
    }

    const toolResults = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        const fat = fatCustomerRecord();
        const payload = mode === "fat" ? fat : trimCustomerRecord(fat);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(payload),
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
}

async function main() {
  console.log("\nMeasuring input_tokens on the API trip AFTER the tool result");
  console.log("enters the context window...\n");

  const fatTokens = await runAgent("fat");
  console.log(`FAT tool result (40 fields):     ${fatTokens} input tokens`);

  const trimTokens = await runAgent("trim");
  console.log(`TRIMMED tool result (5 fields):  ${trimTokens} input tokens`);

  const saved = fatTokens - trimTokens;
  console.log(`\nDifference: ${saved} tokens wasted by NOT trimming.`);
  console.log("Now multiply that by every tool call in a long agent run.");
  console.log("That is failure mode #2 — and why trimming tool output matters.");
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
