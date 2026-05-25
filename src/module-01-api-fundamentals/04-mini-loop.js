// ===================================================================
// Module 1 · Concept 1.4 — A Mini Agentic Loop
// ===================================================================
// This consolidates Concepts 1.1-1.3. An "agent" is not magic — it is
// a WHILE LOOP around the Messages API that branches on stop_reason:
//
//   loop:
//     response = call API with (messages, tools)
//     append response to messages          (role: "assistant")
//     if stop_reason != "tool_use"  -> DONE, show final text, break
//     else:
//        run each requested tool
//        append the results to messages    (role: "user", tool_result)
//        loop again
//
// The model may need SEVERAL trips through this loop before it has
// everything it needs. That is why it must be a loop, not an `if`.
//
// Run me with:  npm run m1:loop
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// -------------------------------------------------------------------
// 1. TOOL DEFINITION — what the model sees. (Full detail in Module 2.)
//    The `description` is how the model decides to call it.
// -------------------------------------------------------------------
const tools = [
  {
    name: "get_order_status",
    description:
      "Look up the current shipping status of a customer order by its " +
      "order ID. Returns status, carrier, and estimated delivery date. " +
      "Order IDs look like 'ORD-1001'.",
    input_schema: {
      type: "object",
      properties: {
        order_id: {
          type: "string",
          description: "The order ID, e.g. ORD-1001",
        },
      },
      required: ["order_id"],
    },
  },
];

// -------------------------------------------------------------------
// 2. TOOL EXECUTOR — your real code. The model NEVER runs this; it only
//    asks for it. Here it is a mock "database".
// -------------------------------------------------------------------
const FAKE_DB = {
  "ORD-1001": { status: "in transit", carrier: "DHL", eta: "2026-05-27" },
  "ORD-1002": { status: "delivered", carrier: "UPS", eta: "2026-05-20" },
};

function runTool(name, input) {
  console.log(`   [tool] running ${name}(${JSON.stringify(input)})`);
  if (name === "get_order_status") {
    return FAKE_DB[input.order_id] ?? { error: "order not found" };
  }
  return { error: `unknown tool: ${name}` };
}

// -------------------------------------------------------------------
// 3. THE LOOP.
// -------------------------------------------------------------------
async function runAgent(userQuestion) {
  const messages = [{ role: "user", content: userQuestion }];
  let turn = 0;

  while (true) {
    turn++;
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system:
        "You are a customer-support assistant. Use tools to look up real data; never guess order details.",
      tools,
      messages,
    });

    console.log(`\n-- API trip ${turn} -- stop_reason: ${res.stop_reason}`);

    // ALWAYS echo the assistant's full response back into history.
    messages.push({ role: "assistant", content: res.content });

    // BRANCH on stop_reason — the heart of the agent.
    if (res.stop_reason !== "tool_use") {
      const finalText = res.content.find((b) => b.type === "text")?.text ?? "";
      console.log("\n=== FINAL ANSWER ===\n" + finalText);
      return;
    }

    // stop_reason === "tool_use": the model paused to ask for tools.
    // Run every tool_use block it emitted this turn.
    const toolResults = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        const result = runTool(block.name, block.input);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id, // MUST match the tool_use block's id
          content: JSON.stringify(result),
        });
      }
    }

    // Tool results go back as a USER turn (Concept 1.2's surprise).
    messages.push({ role: "user", content: toolResults });
    // ...and the while loop sends them on the next trip.
  }
}

async function main() {
  console.log("################ Q1: needs a tool ################");
  await runAgent("Where is my order ORD-1002? When will it arrive?");

  console.log("\n\n################ Q2: no tool needed ################");
  await runAgent("Thanks! What are your support hours?");
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
