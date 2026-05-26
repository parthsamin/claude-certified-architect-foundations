// ===================================================================
// Module 3 · Concept 3.5 — Hooks (Deterministic Interception)
// ===================================================================
// HOOKS run on every tool call, in YOUR code, deterministically.
// Two flavors the exam tests:
//
//   PreToolUse   runs BEFORE the handler. Can BLOCK / REDIRECT a call.
//                Use for policy enforcement (refunds > $500, PII
//                writes, deletion of production data).
//
//   PostToolUse  runs AFTER the handler, BEFORE the model sees the
//                result. Can NORMALIZE / TRIM / REDACT the payload.
//                Use for date formats, currency normalization,
//                stripping un-needed fields (the Module-1.6 fix),
//                PII redaction in logs.
//
// THE EXAM TABLE (memorize):
//
//   Attribute       | Hooks             | Prompt instructions
//   ----------------|-------------------|--------------------------
//   Guarantee       | DETERMINISTIC     | PROBABILISTIC (>90%)
//   When to use     | Critical business | General preferences
//                   | rules, financial, | formatting, hints
//                   | safety, compliance|
//   Example         | "block refunds    | "try to solve before
//                   | over $500"        |  escalating"
//
// RULE: when failure has FINANCIAL, LEGAL, or SAFETY consequences,
// use a HOOK — not a prompt instruction. Prompts are guidelines;
// hooks are guardrails.
//
// Demo: a refund agent with a PreToolUse hook that blocks any
// process_refund(amount > 500), and a PostToolUse hook that
// normalizes the order's status field. We try one refund of $199
// (allowed) and one of $999 (blocked). The blocked one is enforced
// by code — the model could not "talk past" it if it tried.
//
// Run me with:  npm run m3:hooks
// ===================================================================

import { Agent } from "./agent.js";

const orders = {
  "ORD-9":  { id: "ORD-9",  customer_id: "cust_42", total: 199.0, status: "SHIPPED",   ship_date: "Mar 5, 2026" },
  "ORD-10": { id: "ORD-10", customer_id: "cust_42", total: 999.0, status: "delivered", ship_date: "2026-03-05" },
};
const refundLog = [];

const TOOL_CATALOG = {
  lookup_order: {
    schema: {
      name: "lookup_order",
      description: "Look up an order by ID. Returns customer_id, total, status, ship_date.",
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
        "Issue a refund for an order. IRREVERSIBLE. Requires order_id and amount.",
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
      return { ok: true, refund_id: `REF-${refundLog.length}`, amount };
    },
  },
};

// -------------------------------------------------------------------
// THE HOOKS — pure code, deterministic, run on every tool call.
// -------------------------------------------------------------------
const REFUND_CEILING = 500;

function preToolUseHook({ tool, input, agent }) {
  // POLICY: refunds over $500 require human review. Period.
  if (tool === "process_refund" && input.amount > REFUND_CEILING) {
    console.log(
      `   [hook PreToolUse]  BLOCKED ${agent} -> process_refund($${input.amount}) > $${REFUND_CEILING}`,
    );
    // Returning a value short-circuits the handler. The model sees
    // this as the tool_result and is told the refund did not happen.
    return {
      blocked: true,
      reason: `Refunds over $${REFUND_CEILING} require escalation to a human reviewer. No refund was issued.`,
    };
  }
  // No return -> normal execution proceeds.
}

function postToolUseHook({ tool, result }) {
  // NORMALIZE: the lookup_order tool returns inconsistent date formats
  // ("Mar 5, 2026" vs "2026-03-05"). The model should see one canonical
  // shape — normalize here so downstream reasoning is stable.
  if (tool === "lookup_order" && result && typeof result === "object") {
    let normalized = result.ship_date;
    if (normalized) {
      const d = new Date(normalized);
      if (!isNaN(d)) normalized = d.toISOString().slice(0, 10); // YYYY-MM-DD
    }
    return {
      ...result,
      status: String(result.status ?? "").toLowerCase(), // normalize SHIPPED/shipped
      ship_date: normalized,
    };
  }
}

const refundAgent = new Agent({
  name: "refund_agent",
  description: "Processes refunds. Subject to a $500 hook-enforced ceiling.",
  systemPrompt:
    "You are a refund agent. Verify the order with lookup_order, then call " +
    "process_refund. If process_refund returns blocked=true, explain to the " +
    "user that the request requires human review.",
  allowedTools: ["lookup_order", "process_refund"],
  toolCatalog: TOOL_CATALOG,
  hooks: { preToolUse: preToolUseHook, postToolUse: postToolUseHook },
});

async function main() {
  console.log("\n### Case A: refund $199 (under $500 ceiling) ###");
  console.log(await refundAgent.run("Please refund $199 for order ORD-9."));

  console.log("\n### Case B: refund $999 (over $500 ceiling) ###");
  console.log(await refundAgent.run("Please refund $999 for order ORD-10."));

  console.log("\n--- Server-side refund log (truth) ---");
  console.log(refundLog);
  console.log(
    "\nNote: only the $199 refund actually happened. The $999 refund was BLOCKED",
  );
  console.log("at the hook layer — the handler was never even called. The model");
  console.log("could not have 'talked past' this; the enforcement is in code.");
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
