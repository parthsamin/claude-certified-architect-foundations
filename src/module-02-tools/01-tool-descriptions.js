// ===================================================================
// Module 2 · Concept 2.1 — Tool Definitions: Description as Selection
// ===================================================================
// Recap of tool_use: Claude does NOT run code. It emits a structured
// REQUEST to call a tool; your code runs it and returns the result.
//
// THE CORE IDEA: the model picks a tool from the SIGNALS in its
// definition. Those signals are: the `name`, the schema field names,
// AND the `description`. In real apps the description is the richest
// signal and the one you control most deliberately.
//
// EXPERIMENT DESIGN NOTE:
// To prove the description matters, we must ISOLATE it. So both tools
// below use:
//   - GENERIC names ......... tool_x / tool_y  (no hint)
//   - the SAME generic field  query            (no hint)
// ...leaving the `description` as the ONLY thing the model can use.
//
// In BOTH sets, tool_x is the KB tool and tool_y is the account tool.
//   VAGUE set    -> descriptions don't reveal that -> model must GUESS
//   DETAILED set -> descriptions reveal it clearly -> model routes right
//
// Run me with:  npm run m2:desc
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const genericSchema = {
  type: "object",
  properties: { query: { type: "string" } },
  required: ["query"],
};

// -------------------------------------------------------------------
// VAGUE set — names, fields, AND descriptions give no distinguishing
// signal. The model literally cannot know which tool is which.
// -------------------------------------------------------------------
const vagueTools = [
  { name: "tool_x", description: "Retrieves information.", input_schema: genericSchema },
  { name: "tool_y", description: "Gets data for the request.", input_schema: genericSchema },
];

// -------------------------------------------------------------------
// DETAILED set — SAME generic names, SAME field. Only the descriptions
// change: now each clearly states its lane and contrasts the sibling.
// -------------------------------------------------------------------
const detailedTools = [
  {
    name: "tool_x",
    description:
      "Search the company knowledge base for GENERAL information that is " +
      "the same for every customer: return policy, shipping options, " +
      "warranty terms, store hours, product FAQs. Use for any question " +
      "NOT tied to one specific order. Do NOT use to look up an order.",
    input_schema: genericSchema,
  },
  {
    name: "tool_y",
    description:
      "Look up data for ONE specific customer order by its ID (e.g. " +
      "'ORD-9'): that order's shipping status, items, and dates. Use " +
      "ONLY when the question is about a particular order. Do NOT use " +
      "for general policy or FAQ questions.",
    input_schema: genericSchema,
  },
];

// tool_choice:"any" FORCES a pick, isolating the WHICH-tool decision.
async function whichTool(tools, question) {
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system: "You are a support agent. Use the most appropriate tool to help.",
    tools,
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: question }],
  });
  const toolBlock = res.content.find((b) => b.type === "tool_use");
  return toolBlock ? toolBlock.name : "none";
}

async function main() {
  // tool_x = KB tool, tool_y = account tool.
  const questions = [
    { q: "What is your return policy?",      expected: "tool_x" },
    { q: "Has my order ORD-9 shipped yet?",  expected: "tool_y" },
    { q: "Do you ship internationally?",     expected: "tool_x" },
  ];

  // Run each question 3x to expose INSTABILITY, not just one bad pick.
  const RUNS = 3;

  for (const set of [
    { label: "VAGUE descriptions", tools: vagueTools },
    { label: "DETAILED descriptions", tools: detailedTools },
  ]) {
    console.log(`\n===== ${set.label} =====`);
    for (const { q, expected } of questions) {
      const picks = [];
      for (let i = 0; i < RUNS; i++) picks.push(await whichTool(set.tools, q));
      const correct = picks.filter((p) => p === expected).length;
      console.log(`  "${q}"`);
      console.log(`     picks over ${RUNS} runs: [${picks.join(", ")}]  -> ${correct}/${RUNS} correct`);
    }
  }

  console.log("\nNames and schema were identical across both sets.");
  console.log("Only the DESCRIPTION changed. That is the selection algorithm.");
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
