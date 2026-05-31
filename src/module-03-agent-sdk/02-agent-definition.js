// ===================================================================
// Module 3 · Concept 3.2 — AgentDefinition Configuration
// ===================================================================
// `AgentDefinition` (the SDK) and our `Agent` (./agent.js) take the
// same four configuration knobs:
//
//   name         identifier ("customer_support", "researcher")
//   description  what the agent is for — used by COORDINATORS later
//                to decide which subagent to delegate to (Concept 3.3)
//   systemPrompt role / constraints / output format
//   allowedTools the SUBSET of the global tool catalog this agent may
//                call. PRINCIPLE OF LEAST PRIVILEGE: give every agent
//                the smallest set of tools it needs — nothing more.
//
// The exam loves the "least privilege" question. A tier-1 agent that
// only LOOKS UP orders should not be able to PROCESS REFUNDS or
// DELETE accounts, even if the system prompt says "don't". Prompts
// are probabilistic (~90%+) — withholding the tool is deterministic.
//
// In this demo, ONE tool catalog is shared across THREE agents with
// different allowedTools sets. We then ask each agent to issue a
// refund. Only the agent that was GIVEN process_refund can do it.
//
// Run me with:  npm run m3:def
// ===================================================================

import { Agent } from "./agent.js";
import { tracer, finalizeTracing } from "../lib/optional-tracer.js";

// -------------------------------------------------------------------
// THE TOOL CATALOG — every tool that exists in our "company".
// Each entry has its JSON-schema definition (what the model sees)
// and a handler (your real code).
// -------------------------------------------------------------------
const customers = {
  "cust_42": { id: "cust_42", name: "Jane Doe", email: "jane@example.com", tier: "pro" },
};
const orders = {
  "ORD-9": { id: "ORD-9", customer_id: "cust_42", total: 199.0, status: "shipped" },
};
const refundLog = [];

const TOOL_CATALOG = {
  get_customer: {
    schema: {
      name: "get_customer",
      description:
        "Look up a customer's account profile by customer_id. " +
        "Returns name, email, and account tier. Use for any " +
        "question that needs account-level data.",
      input_schema: {
        type: "object",
        properties: { customer_id: { type: "string" } },
        required: ["customer_id"],
      },
    },
    handler: ({ customer_id }) => customers[customer_id] ?? { error: "not found" },
  },
  lookup_order: {
    schema: {
      name: "lookup_order",
      description:
        "Look up a specific order by order_id. Returns the order's " +
        "customer_id, total, and shipping status. Use to inspect or " +
        "verify an order BEFORE acting on it.",
      input_schema: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
    },
    handler: ({ order_id }) => orders[order_id] ?? { error: "not found" },
  },
  process_refund: {
    schema: {
      name: "process_refund",
      description:
        "Issue a refund for an order. IRREVERSIBLE — moves real money. " +
        "Requires order_id and amount. Use only after verifying the " +
        "order with lookup_order.",
      input_schema: {
        type: "object",
        properties: {
          order_id: { type: "string" },
          amount: { type: "number" },
        },
        required: ["order_id", "amount"],
      },
    },
    handler: ({ order_id, amount }) => {
      refundLog.push({ order_id, amount });
      return { ok: true, refund_id: `REF-${refundLog.length}` };
    },
  },
  delete_account: {
    schema: {
      name: "delete_account",
      description:
        "Permanently delete a customer account. DESTRUCTIVE and " +
        "irreversible. Use only with explicit admin authorization.",
      input_schema: {
        type: "object",
        properties: { customer_id: { type: "string" } },
        required: ["customer_id"],
      },
    },
    handler: ({ customer_id }) => {
      delete customers[customer_id];
      return { ok: true };
    },
  },
};

// -------------------------------------------------------------------
// THREE agents drawn from the SAME catalog, with DIFFERENT
// privilege levels. The pattern is what the exam calls
// "principle of least privilege" — also written as `allowed_tools`.
// -------------------------------------------------------------------
const tier1Agent = new Agent({
  name: "tier1_lookup",
  description: "Front-line agent. Looks up customers and orders. Read-only.",
  systemPrompt: "You are a tier-1 support agent. Help the user with their request using the tools you have.",
  // Read-only tools ONLY. No refunds, no deletions.
  allowedTools: ["get_customer", "lookup_order"],
  toolCatalog: TOOL_CATALOG,
  tracer,
});

const refundAgent = new Agent({
  name: "refund_specialist",
  description: "Handles refund requests after verifying the order.",
  systemPrompt:
    "You are a refund specialist. Verify the order with lookup_order " +
    "before issuing any refund. Then call process_refund.",
  allowedTools: ["get_customer", "lookup_order", "process_refund"],
  toolCatalog: TOOL_CATALOG,
  tracer,
});

const adminAgent = new Agent({
  name: "admin",
  description: "Full-privilege agent. Reserved for explicit admin workflows.",
  systemPrompt: "You are an admin assistant with full privileges.",
  allowedTools: Object.keys(TOOL_CATALOG), // everything
  toolCatalog: TOOL_CATALOG,
  tracer,
});

async function main() {
  const question = "Please refund $199 for order ORD-9 (customer cust_42).";

  console.log("\n### tier1_lookup tries to refund ###");
  console.log("(refund tool is NOT in its allowedTools — should refuse / explain)");
  console.log("RESULT:", await tier1Agent.run(question));

  console.log("\n### refund_specialist refunds ###");
  console.log("(has process_refund — should verify then refund)");
  console.log("RESULT:", await refundAgent.run(question));

  console.log("\nRefund log on the server:", refundLog);
  console.log(
    "\nThe tier-1 agent COULD NOT call process_refund. Not because we asked it nicely —",
  );
  console.log("because the tool was never in its allowedTools list. Enforcement, not request.");

  await finalizeTracing();
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
