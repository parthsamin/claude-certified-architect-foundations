// ===================================================================
// Module 9 · Concepts 9.1–9.4 — Escalation & Human-in-the-Loop
// ===================================================================
// RELIABLE escalation triggers (exam-tested rules):
//   1. Customer explicitly asks "get me a manager"     -> IMMEDIATE
//   2. Policy does not cover the request               -> escalate
//   3. Agent can't make progress after reasonable try  -> escalate
//   4. Financial op above threshold                    -> escalate
//      (preferably HOOK, not prompt — Module 3.5)
//   5. Multiple matches for customer lookup            -> ask for ID,
//      do NOT guess
//
// NOT reliable triggers:
//   - Sentiment ("customer sounds mad")  — mood != complexity
//   - Model self-rated confidence 1–10   — model is confidently wrong
//   - Heuristic ML classifier            — overengineering
//
// STRUCTURED HANDOFF — when escalating, the human ONLY sees this
// JSON (not the conversation). It must be self-contained:
//   { customer_id, customer_name, issue_summary, order_id,
//     root_cause, actions_taken, recommended_action, escalation_reason }
//
// THIS DEMO drives an agent through three scenarios:
//   A. "Get me a manager" -> IMMEDIATE escalation, no resolution attempt
//   B. Competitor price match (policy gap) -> escalate (policy doesn't cover)
//   C. Damaged item -> attempt resolution; on insistence -> escalate
// Each escalation produces a structured handoff. We print the handoff
// JSON each time so the contrast is visible.
//
// Run me with:  npm run m9:escalate
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const escalateTool = {
  name: "escalate_to_human",
  description:
    "Escalate the case to a human operator. The handoff MUST be " +
    "self-contained — the operator will not see the conversation transcript.",
  input_schema: {
    type: "object",
    properties: {
      customer_id:        { type: "string" },
      customer_name:      { type: ["string", "null"] },
      issue_summary:      { type: "string" },
      order_id:           { type: ["string", "null"] },
      root_cause:         { type: "string" },
      actions_taken:      { type: "array", items: { type: "string" } },
      recommended_action: { type: "string" },
      escalation_reason:  { type: "string", enum: ["explicit_request", "policy_gap", "no_progress", "financial_threshold", "ambiguous_lookup"] },
    },
    required: ["customer_id", "issue_summary", "root_cause", "actions_taken", "recommended_action", "escalation_reason"],
  },
};

const resolveTool = {
  name: "respond_to_customer",
  description: "Send a reply to the customer in plain language. Use to attempt resolution.",
  input_schema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
};

const SYSTEM = `
You are a customer support agent for ACME Inc.

ESCALATE IMMEDIATELY (call escalate_to_human, do NOT attempt resolution) when:
- The customer explicitly asks for a manager / human / supervisor.
- The request requires a policy ACME does not have (e.g., competitor price matching — our policy is silent on competitors).
- A financial operation > $500.
- A customer search returns multiple matches and you can't disambiguate.

ATTEMPT RESOLUTION FIRST, escalate only if the customer insists:
- General dissatisfaction without an explicit "manager" request.
- Damaged-item requests under $500.

Do NOT use sentiment or self-rated confidence as escalation triggers.

When escalating, fill the structured handoff JSON precisely — the operator does NOT see this conversation. Make the handoff self-contained.
`;

async function run(scenarioLabel, userMessage, priorContext = "") {
  console.log(`\n\n############ ${scenarioLabel} ############`);
  console.log(`Customer: ${userMessage}`);
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 800,
    system: SYSTEM,
    tools: [escalateTool, resolveTool],
    messages: [
      { role: "user", content: priorContext + userMessage },
    ],
  });
  for (const block of res.content) {
    if (block.type === "tool_use" && block.name === "escalate_to_human") {
      console.log(`Agent action: ESCALATE`);
      console.log(JSON.stringify(block.input, null, 2));
    } else if (block.type === "tool_use" && block.name === "respond_to_customer") {
      console.log(`Agent action: RESPOND TO CUSTOMER`);
      console.log(`  > ${block.input.message}`);
    } else if (block.type === "text") {
      console.log(`Agent text: ${block.text}`);
    }
  }
}

async function main() {
  // Scenario A — immediate escalation on explicit request.
  await run(
    "A. Explicit 'get me a manager'",
    "I need to speak to a manager right now. Customer ID CUST-12345.",
  );

  // Scenario B — policy gap.
  await run(
    "B. Policy gap (competitor price match)",
    "Customer CUST-67890. Competitor X has the same widget for 30% cheaper. Match the price.",
  );

  // Scenario C — damaged item; the agent should try to resolve first.
  await run(
    "C. Damaged item (should attempt resolution)",
    "Customer CUST-22222. Order ORD-44444. The item arrived broken. I want a refund.",
  );

  // Scenario C continued — customer insists on a human.
  await run(
    "C2. Damaged item, customer insists on human",
    "I don't want a replacement. I want to talk to a real person.",
    "Prior context: customer CUST-22222 reported damaged item ORD-44444. Agent offered replacement; customer is now insisting on a human.\n\n",
  );

  console.log(`\n\nLook for: A and B escalate immediately with a structured handoff JSON; C attempts resolution first; C2 escalates after the customer insists. Each handoff is fully self-contained (no need to read the conversation).`);
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
