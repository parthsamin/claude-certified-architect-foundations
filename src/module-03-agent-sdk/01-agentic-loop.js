// ===================================================================
// Module 3 · Concept 3.1 — The Agentic Loop, Formalized
// ===================================================================
// You already built an agentic loop by hand in Module 1. The Claude
// Agent SDK formalizes that exact pattern as a reusable abstraction:
// configure an agent once, hand it a task, and the SDK runs the loop
// for you. To make the architecture crystal clear (and avoid forcing
// the Claude Code CLI as a dependency), we re-implement the SDK's
// `AgentDefinition + run-loop` shape ourselves over the raw API.
//
// What you'll see by the end of Module 3:
//   class Agent { name, description, systemPrompt, tools, handlers }
//   agent.run(prompt)   ->  runs the agentic loop to end_turn
//
// THE ANTI-PATTERNS the exam loves to test:
//   X  Parsing assistant text for "task complete" / "done"
//   X  Using max_iterations as the PRIMARY stop condition
//   X  Treating ANY textual content as a completion signal
//
//   ✓  ONLY reliable completion signal: stop_reason === "end_turn".
//
// A max-iteration cap is fine as a SAFETY NET (kill runaway loops),
// but it must THROW/ERROR — not silently "succeed" as if finished.
//
// Run me with:  npm run m3:loop
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// -------------------------------------------------------------------
// The minimal Agent abstraction — mirrors the SDK's AgentDefinition.
// You configure it ONCE; you call .run(prompt) MANY times.
// -------------------------------------------------------------------
class Agent {
  constructor({ name, description, systemPrompt, tools, handlers, maxIterations = 25 }) {
    this.name = name;
    this.description = description;          // for documentation / future routing
    this.systemPrompt = systemPrompt;
    this.tools = tools;                      // tool schemas the model sees
    this.handlers = handlers;                // name -> function(input) => result
    this.maxIterations = maxIterations;      // SAFETY NET — not the primary stop signal
  }

  async run(userPrompt) {
    const messages = [{ role: "user", content: userPrompt }];

    for (let i = 1; i <= this.maxIterations; i++) {
      const res = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: this.systemPrompt,
        tools: this.tools,
        messages,
      });
      console.log(`[${this.name}] iter ${i}  stop_reason=${res.stop_reason}`);
      messages.push({ role: "assistant", content: res.content });

      // === THE ONLY RELIABLE COMPLETION SIGNAL ===
      if (res.stop_reason === "end_turn") {
        return res.content.find((b) => b.type === "text")?.text ?? "";
      }

      // We require tool_use here; any other stop_reason mid-loop is bad
      // news (max_tokens truncated reasoning, unexpected stop_sequence).
      if (res.stop_reason !== "tool_use") {
        throw new Error(`[${this.name}] unexpected stop_reason: ${res.stop_reason}`);
      }

      // Execute every requested tool and feed results back as user turn.
      const toolResults = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        const handler = this.handlers[block.name];
        const result = handler
          ? await handler(block.input)
          : { error: `no handler for tool ${block.name}` };
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    // We blew through the safety cap. THROW — do NOT pretend we
    // finished. That would be the "treat iteration cap as completion"
    // anti-pattern, and it silently corrupts downstream code.
    throw new Error(
      `[${this.name}] aborted: hit max iterations (${this.maxIterations}) ` +
      `without an end_turn. The agent looped without converging.`,
    );
  }
}

// -------------------------------------------------------------------
// Build two agents with DIFFERENT configs but the SAME class. This is
// the leverage the SDK gives you: write the loop once, configure many.
// -------------------------------------------------------------------
const orderDB = {
  "ORD-1001": { status: "in transit", carrier: "DHL", eta: "2026-05-27" },
  "ORD-1002": { status: "delivered", carrier: "UPS", eta: "2026-05-20" },
};

const supportAgent = new Agent({
  name: "support",
  description: "Handles customer order and FAQ questions.",
  systemPrompt:
    "You are a customer-support assistant. Use tools to look up real data; never guess order details.",
  tools: [
    {
      name: "get_order_status",
      description: "Look up the status of a customer order by ID (e.g. ORD-1001). Returns status, carrier, and ETA.",
      input_schema: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
    },
  ],
  handlers: {
    get_order_status: ({ order_id }) =>
      orderDB[order_id] ?? { error: "order not found" },
  },
});

const mathAgent = new Agent({
  name: "math",
  description: "Answers basic arithmetic. No tools needed — pure reasoning.",
  systemPrompt: "You answer arithmetic questions concisely.",
  tools: [], // no tools at all -> the loop should exit in iter 1 with end_turn
});

async function main() {
  console.log("\n### Run 1: tool-driven (support) ###");
  console.log("FINAL:", await supportAgent.run("Where is order ORD-1001?"));

  console.log("\n### Run 2: no tools needed (math) ###");
  console.log("FINAL:", await mathAgent.run("What is 17 * 24?"));

  console.log("\nSame Agent class, two configs, two task styles.");
  console.log("The completion signal in BOTH runs was stop_reason='end_turn'.");
}

main().catch((err) => {
  console.error("Agent run failed:", err.message);
  process.exit(1);
});
