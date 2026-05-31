// ===================================================================
// Module 6 · Concept 6.6 — Self-correction
// ===================================================================
// Pattern: ask the model to extract BOTH the stated value AND a
// computed/derived value, then return a `conflict_detected` flag if
// they disagree. Your downstream code branches on the flag.
//
//   {
//     "stated_total": 150.00,
//     "computed_total": 145.00,
//     "conflict_detected": true,
//     "reason": "Sum of line items (145.00) != stated total (150.00).",
//     "line_items": [...]
//   }
//
// This is different from retry-with-feedback (6.5):
//   - 6.5  external validator checks, retry with the error if it fails.
//   - 6.6  the MODEL itself flags the conflict in its first response.
//
// Self-correction is great for documents where the SOURCE itself is
// inconsistent — the invoice's printed total may simply be wrong, and
// retrying won't fix the source. Flagging the conflict lets you
// surface to a human / escalate (Module 9) instead of fighting the
// data.
//
// Run me with:  npm run m6:correct
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// An invoice with a printed total that is WRONG: items sum to 87.50
// but the printed TOTAL line says 95.00.
const INCONSISTENT_INVOICE =
  "INVOICE #A-99\n" +
  "  Widget x2 ......... 30.00\n" +
  "  Gadget x1 ......... 45.50\n" +
  "  Shipping .......... 12.00\n" +
  "  TOTAL ............. 95.00\n";

// A consistent invoice for comparison: items sum to 87.50, total = 87.50.
const CONSISTENT_INVOICE =
  "INVOICE #A-100\n" +
  "  Widget x2 ......... 30.00\n" +
  "  Gadget x1 ......... 45.50\n" +
  "  Shipping .......... 12.00\n" +
  "  TOTAL ............. 87.50\n";

const tool = {
  name: "record_invoice_with_self_check",
  description: "Record line items, the STATED total, the COMPUTED total (sum of items), and a conflict flag.",
  input_schema: {
    type: "object",
    properties: {
      line_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label:  { type: "string" },
            amount: { type: "number" },
          },
          required: ["label", "amount"],
        },
      },
      stated_total:      { type: "number", description: "The total as printed on the invoice" },
      computed_total:    { type: "number", description: "The sum of all line item amounts you computed yourself" },
      conflict_detected: { type: "boolean", description: "True iff stated_total and computed_total differ beyond rounding" },
      reason:            { type: ["string", "null"], description: "If conflict_detected, a one-sentence explanation. Else null." },
    },
    required: ["line_items", "stated_total", "computed_total", "conflict_detected"],
  },
};

async function extract(label, invoice) {
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system:
      "You extract structured invoice data. Always extract BOTH the printed total " +
      "AND compute the sum of line items yourself. If they differ, set " +
      "conflict_detected=true and explain. This is for downstream auditing.",
    tools: [tool],
    tool_choice: { type: "tool", name: "record_invoice_with_self_check" },
    messages: [{ role: "user", content: `Extract:\n\n${invoice}` }],
  });
  const out = res.content.find((b) => b.type === "tool_use").input;
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function main() {
  await extract("INCONSISTENT invoice (printed TOTAL is wrong)", INCONSISTENT_INVOICE);
  await extract("CONSISTENT invoice", CONSISTENT_INVOICE);

  console.log(
    "\nObserve: the inconsistent invoice should come back with conflict_detected=true",
  );
  console.log("and a reason; the consistent one with conflict_detected=false.");
  console.log("Downstream code branches on the flag — no retry loop needed.");
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
