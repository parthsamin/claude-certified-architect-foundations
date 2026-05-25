// ===================================================================
// Module 1 · Concept 1.5 — The System Prompt
// ===================================================================
// The system prompt defines role, constraints, and output format.
// It is passed SEPARATELY (the `system` field), has priority over user
// messages, and applies to the whole conversation.
//
// THE EXAM TRAP: system-prompt wording creates UNINTENDED TOOL
// ASSOCIATIONS. A pushy instruction like "ALWAYS verify the customer"
// biases the model to call get_customer even when it is pointless —
// e.g. for a generic "what are your hours?" question.
//
// This file runs the SAME harmless question under two system prompts
// and counts how many times the customer-lookup tool gets called.
//
// Run me with:  npm run m1:system
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tools = [
  {
    name: "get_customer",
    description:
      "Look up a customer profile by email. Returns name, account " +
      "status, and order history. Use when you need customer-specific data.",
    input_schema: {
      type: "object",
      properties: { email: { type: "string" } },
      required: ["email"],
    },
  },
];

function runTool(name, input) {
  console.log(
    `   [tool] ${name}(${JSON.stringify(input)})  <-- was this call necessary?`,
  );
  if (name === "get_customer") {
    return { name: "Test User", status: "active", orders: 3 };
  }
  return { error: "unknown tool" };
}

// Runs the agent loop and returns how many tools were called in total.
async function runAgent(systemPrompt, userQuestion) {
  const messages = [{ role: "user", content: userQuestion }];
  let toolCalls = 0;

  while (true) {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      tools,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      const text = res.content.find((b) => b.type === "text")?.text ?? "";
      console.log(
        "   final answer:",
        text.replace(/\s+/g, " ").slice(0, 120) + "...",
      );
      return toolCalls;
    }

    const toolResults = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        toolCalls++;
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(runTool(block.name, block.input)),
        });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
}

async function main() {
  // A generic FAQ question. It needs NO customer data at all — but it
  // DOES include an email, so the tool is now structurally callable.
  // (If the email were missing, the model couldn't call get_customer
  //  even under a pushy prompt, because `email` is a required arg and
  //  the model won't fabricate one. Removing that excuse here.)
  const question =
    "Hi, I'm reaching out from jane@example.com. " +
    "What are your customer support hours?";

  // NOTE: results are MODEL-DEPENDENT. Strong models (sonnet-4-6) often
  // resist the trap and answer directly. Weaker models / vaguer prompts
  // over-call. The exam tests that you can NAME this cause regardless.

  // -----------------------------------------------------------------
  // PROMPT A — pushy / overreaching. Absolute, no exceptions.
  // -----------------------------------------------------------------
  const pushyPrompt =
    "You are a support agent. SECURITY POLICY: you MUST call get_customer " +
    "to verify the sender's identity before EVERY response, with NO " +
    "exceptions — including general questions. Never answer without " +
    "verifying first.";

  // -----------------------------------------------------------------
  // PROMPT B — scoped / well-worded. The tool is conditional.
  // -----------------------------------------------------------------
  const scopedPrompt =
    "You are a support agent. Call get_customer ONLY when a request " +
    "depends on that specific customer's account or orders. For general " +
    "questions, answer directly without tools.";

  console.log("\n===== PROMPT A (pushy: 'ALWAYS verify') =====");
  const a = await runAgent(pushyPrompt, question);
  console.log(
    `   >>> get_customer called ${a} time(s) for a generic question\n`,
  );

  console.log("===== PROMPT B (scoped: 'ONLY when needed') =====");
  const b = await runAgent(scopedPrompt, question);
  console.log(
    `   >>> get_customer called ${b} time(s) for a generic question\n`,
  );

  console.log("Lesson: the tools didn't change. The SYSTEM PROMPT changed the");
  console.log("tool-calling behavior. Wording is an architectural lever.");
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
