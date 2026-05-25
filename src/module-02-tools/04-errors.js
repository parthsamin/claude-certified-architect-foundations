// ===================================================================
// Module 2 · Concept 2.4 — Syntax vs Semantic Errors
// ===================================================================
// Two completely different error classes — different causes, different
// fixes. The exam expects you to tell them apart instantly.
//
//   SYNTAX error    invalid JSON, wrong field type, missing brace
//                   FIX: tool_use + JSON Schema -> ELIMINATES it.
//
//   SEMANTIC error  valid JSON, but the VALUES are wrong: totals don't
//                   add up, a value sits in the wrong field, a fact is
//                   hallucinated.
//                   FIX: a separate layer -> validation checks,
//                        retry-with-feedback, self-correction.
//                        A schema CANNOT catch these.
//
// Defense in depth = 3 layers:
//   Layer 1  Schema      -> kills syntax errors
//   Layer 2  Validator   -> detects semantic errors (your code)
//   Layer 3  Retry loop  -> feeds the error back, model corrects
//
// Run me with:  npm run m2:errors
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const INVOICE =
  "INVOICE #A-99\n" +
  "  Widget x2 ......... 30.00\n" +
  "  Gadget x1 ......... 45.50\n" +
  "  Shipping .......... 12.00\n" +
  "  TOTAL ............. 87.50\n";

// LAYER 1 — schema. Guarantees the SHAPE. Says nothing about the math.
const invoiceSchema = {
  type: "object",
  properties: {
    line_items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          amount: { type: "number" },
        },
        required: ["label", "amount"],
      },
    },
    total: { type: "number" },
  },
  required: ["line_items", "total"],
};

// LAYER 2 — semantic validator. THIS is your code, not the schema.
// It checks the one thing a schema fundamentally cannot: do the
// numbers actually make sense?
function validateInvoice(data) {
  const errors = [];
  const sum = data.line_items.reduce((s, li) => s + li.amount, 0);
  if (Math.abs(sum - data.total) > 0.001) {
    errors.push(
      `total is ${data.total} but the line items sum to ${sum.toFixed(2)}`,
    );
  }
  if (data.total < 0) errors.push("total is negative");
  return { ok: errors.length === 0, errors, computedSum: sum };
}

// LAYER 3 — extract WITH a retry-with-feedback loop.
async function extractWithRetry(maxAttempts = 3) {
  // Conversation history persists across attempts so the model SEES
  // its own previous wrong answer plus the specific complaint.
  const messages = [
    { role: "user", content: `Extract the line items and total from:\n\n${INVOICE}` },
  ];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      tools: [
        {
          name: "record_invoice",
          description: "Record the structured line items and total of an invoice.",
          input_schema: invoiceSchema,
        },
      ],
      tool_choice: { type: "tool", name: "record_invoice" },
      messages,
    });

    const toolBlock = res.content.find((b) => b.type === "tool_use");
    let data = toolBlock.input;
    messages.push({ role: "assistant", content: res.content });

    // --- SIMULATION (attempt 1 only) -------------------------------
    // Real models are usually right on simple sums, so to SEE the
    // retry loop fire we pretend the model slipped on its first try.
    // Remove this block to watch real behavior.
    if (attempt === 1) {
      data = { ...data, total: 999.99 };
      console.log("   (simulating a model arithmetic slip on attempt 1)");
    }
    // ---------------------------------------------------------------

    console.log(`\nAttempt ${attempt}: model returned total = ${data.total}`);

    // LAYER 1 already passed (the schema produced valid JSON).
    // LAYER 2: run the semantic validator.
    const check = validateInvoice(data);
    if (check.ok) {
      console.log(`   VALID. line items sum to ${check.computedSum.toFixed(2)} = total.`);
      return data;
    }

    // LAYER 3: feed the specific error back as a tool_result so the
    // model can self-correct on the next attempt.
    console.log(`   SEMANTIC ERROR: ${check.errors.join("; ")}`);
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolBlock.id,
          content:
            `Validation failed: ${check.errors.join("; ")}. ` +
            `Re-read the invoice and call record_invoice again with corrected values.`,
          is_error: true,
        },
      ],
    });
  }
  console.log("\nGave up after max attempts (would escalate to a human).");
  return null;
}

async function main() {
  console.log("INVOICE:\n" + INVOICE);
  console.log("Schema guarantees valid JSON (syntax). It CANNOT check the math.");
  console.log("The validator + retry loop handle the semantics.\n");
  await extractWithRetry();
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
