// ===================================================================
// Module 1 · Concept 1.3 — The stop_reason Field
// ===================================================================
// Every response carries `stop_reason` — WHY the model stopped.
// Your application code BRANCHES on it. Getting this branching right
// is the foundation of the agentic loop (Module 3).
//
//   "end_turn"      -> model finished naturally    -> show user the result
//   "tool_use"      -> model wants to call a tool  -> run it, loop again
//   "max_tokens"    -> hit the output cap          -> response is TRUNCATED
//   "stop_sequence" -> hit a configured stop string-> handle per app logic
//
// Run me with:  npm run m1:stop
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  // -----------------------------------------------------------------
  // CASE 1 — "end_turn": a normal, complete answer.
  // -----------------------------------------------------------------
  const r1 = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Say hello in exactly three words." }],
  });
  console.log("\nCASE 1  stop_reason =", r1.stop_reason);
  console.log("        text:", r1.content[0].text);

  // -----------------------------------------------------------------
  // CASE 2 — "max_tokens": tiny cap forces a TRUNCATED response.
  // The text is cut off mid-thought. This is NOT a complete answer —
  // your code must detect this and decide: raise the cap and retry,
  // or continue the generation. Never show a truncated reply as final.
  // -----------------------------------------------------------------
  const r2 = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 16, // deliberately tiny
    messages: [{ role: "user", content: "Explain the Claude context window in detail." }],
  });
  console.log("\nCASE 2  stop_reason =", r2.stop_reason);
  console.log("        text (truncated!):", r2.content[0].text);

  // -----------------------------------------------------------------
  // CASE 3 — "stop_sequence": the model stops when it would emit a
  // string you listed in `stop_sequences`. The stop string itself is
  // NOT included in the output. `response.stop_sequence` tells you
  // which one fired.
  // -----------------------------------------------------------------
  const r3 = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    stop_sequences: ["END"],
    messages: [
      { role: "user", content: "Count from 1 to 10, then write the word END, then keep counting to 20." },
    ],
  });
  console.log("\nCASE 3  stop_reason =", r3.stop_reason);
  console.log("        stop_sequence  =", r3.stop_sequence);
  console.log("        text:", r3.content[0].text);

  // -----------------------------------------------------------------
  // CASE 4 — "tool_use" is the fourth value. We can't trigger it yet
  // (no tools defined). You'll see it live in Module 2, and BUILD a
  // loop around it in Module 3. Note it here as the agentic trigger.
  // -----------------------------------------------------------------
  console.log("\nCASE 4  stop_reason = \"tool_use\"  (demonstrated in Module 2)");
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
