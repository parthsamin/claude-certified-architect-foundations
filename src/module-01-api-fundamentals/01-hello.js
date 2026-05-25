// ===================================================================
// Module 1 · Concept 1.1 — API Request Structure
// ===================================================================
// The Claude API is a REQUEST -> RESPONSE model. There is NO server-side
// memory: every request is independent. Whatever the model "knows" about
// the conversation, YOU sent it in this request.
//
// Run me with:  npm run m1:hello
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

// The SDK reads ANTHROPIC_API_KEY from the environment automatically,
// but we pass it explicitly here so the dependency is obvious.
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function main() {
  // -----------------------------------------------------------------
  // THE REQUEST. Study every field — the exam tests each one.
  // -----------------------------------------------------------------
  const request = {
    // model: which Claude to use. Trade-off: opus = most capable,
    // sonnet = balanced, haiku = fastest/cheapest.
    model: "claude-sonnet-4-6",

    // max_tokens: a CAP on the RESPONSE length, not the input.
    // If the model hits this cap it stops mid-sentence (see Concept 1.3).
    max_tokens: 1024,

    // system: behavioral rules. Passed SEPARATELY, not inside messages.
    // It has priority over user messages and applies to the whole convo.
    system: "You are a concise assistant. Answer in one sentence.",

    // messages: the conversation history. For a brand-new convo this is
    // just one user turn. The model only sees what is in this array.
    messages: [
      { role: "user", content: "In one sentence, what is the Claude Messages API?" },
    ],
  };

  const response = await client.messages.create(request);

  // -----------------------------------------------------------------
  // THE RESPONSE. Inspect its shape.
  // -----------------------------------------------------------------
  console.log("\n--- Full response object ---");
  console.dir(response, { depth: null });

  console.log("\n--- Just the text ---");
  // content is an ARRAY of blocks. A plain text reply = one text block.
  console.log(response.content[0].text);

  console.log("\n--- stop_reason ---", response.stop_reason);
  console.log("--- usage ---", response.usage); // input/output token counts
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
