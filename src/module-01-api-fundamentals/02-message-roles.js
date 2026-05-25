// ===================================================================
// Module 1 · Concept 1.2 — Message Roles
// ===================================================================
// The `messages` array uses roles. The two you write by hand:
//   user      -> messages from the human / your application
//   assistant -> the model's own previous replies (you echo them back)
// A third, `tool`, is really an `assistant` turn that REQUESTS a tool
// plus a `user` turn carrying a `tool_result` block (covered in Module 2).
//
// This file proves the central rule: state lives in YOUR array.
// Resend history -> coherent. Drop it -> amnesia.
//
// Run me with:  npm run m1:roles
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// One API round-trip. Returns the assistant's text.
async function ask(messages) {
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system: "You are concise. Answer in one short sentence.",
    messages,
  });
  return res.content[0].text;
}

async function main() {
  // -----------------------------------------------------------------
  // CASE A — CORRECT: we carry the full history forward.
  // -----------------------------------------------------------------
  console.log("\n===== CASE A: history preserved =====");

  // Turn 1
  const history = [
    { role: "user", content: "My favorite number is 7. Remember it." },
  ];
  const reply1 = await ask(history);
  console.log("user:      My favorite number is 7. Remember it.");
  console.log("assistant:", reply1);

  // CRITICAL STEP: append the assistant's reply back into the array,
  // with role "assistant", before the next user turn.
  history.push({ role: "assistant", content: reply1 });

  // Turn 2 — we ask a question that depends on Turn 1.
  history.push({ role: "user", content: "What is my favorite number?" });
  const reply2 = await ask(history);
  console.log("user:      What is my favorite number?");
  console.log("assistant:", reply2, "  <-- knows it, because history was sent");

  // -----------------------------------------------------------------
  // CASE B — BROKEN: we send ONLY the new turn, no history.
  // -----------------------------------------------------------------
  console.log("\n===== CASE B: history dropped =====");
  const replyAmnesia = await ask([
    { role: "user", content: "What is my favorite number?" },
  ]);
  console.log("user:      What is my favorite number?");
  console.log("assistant:", replyAmnesia, "  <-- no idea: stateless API, nothing was sent");

  console.log("\nLesson: the conversation is whatever lives in YOUR messages array.");
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
