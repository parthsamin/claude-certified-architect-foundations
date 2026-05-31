// ===================================================================
// Module 6 · Concept 6.1 — Few-shot Prompting
// ===================================================================
// Few-shot prompting = include 2–4 input/output EXAMPLES in the prompt
// to demonstrate the expected behavior. The model generalizes the
// pattern to new inputs (it does not just replay the examples).
//
// Why few-shot beats vague instructions ("be precise", "use a clean
// format"):
//   - Vague text is ambiguous; the model fills the gap differently
//     each run -> inconsistent outputs.
//   - One example unambiguously shows the EXACT format and the EXACT
//     decision logic you want.
//
// Five flavors of example (memorize for the exam):
//   1. Ambiguous scenarios       (route this kind of request to X)
//   2. Output formatting         (every result follows THIS shape)
//   3. Acceptable vs problematic (flag/don't-flag side-by-side)
//   4. Multiple document formats (parse inline citations vs refs)
//   5. Informal measurements     (the demo below)
//
// EXTRA RULE (also exam-tested): on top of a strict JSON schema, add
// NORMALIZATION RULES in the prompt — dates to ISO 8601, currency to
// {amount, code}, "half" -> 0.5, etc. The schema enforces structure;
// normalization rules enforce that VALUES are consistent.
//
// This file extracts measurements from informal cooking instructions.
// We extract the SAME 4 inputs twice:
//   - ZERO-SHOT: the schema + a one-line instruction, no examples
//   - FEW-SHOT : same schema + 3 example I/O pairs + instruction
// Watch how few-shot pins the output shape and choice of units.
//
// Run me with:  npm run m6:fewshot
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const tool = {
  name: "record_measurement",
  description: "Record a normalized measurement extracted from informal cooking text.",
  input_schema: {
    type: "object",
    properties: {
      amount:        { type: "string", description: "Normalized amount with metric unit, e.g. '~100g' or '~5ml'" },
      original_text: { type: "string", description: "The phrase verbatim from the input" },
      precision:     { type: "string", enum: ["exact", "approximate", "unclear"] },
    },
    required: ["amount", "original_text", "precision"],
  },
};

const TEST_INPUTS = [
  "about two handfuls of rice",
  "a pinch of salt",
  "a generous splash of olive oil",
  "a dollop of yogurt",
];

const FEW_SHOT_EXAMPLES = `Examples:

Input: "about a cup of flour"
Output: { "amount": "~120g", "original_text": "about a cup", "precision": "approximate" }

Input: "exactly 250ml of milk"
Output: { "amount": "250ml", "original_text": "exactly 250ml", "precision": "exact" }

Input: "a knob of butter"
Output: { "amount": "~15g", "original_text": "a knob", "precision": "approximate" }
`;

async function extract(label, useFewShot, input) {
  const system = useFewShot
    ? `You extract measurements from informal cooking instructions. ${FEW_SHOT_EXAMPLES}\nNow handle the next input the same way.`
    : `You extract measurements from informal cooking instructions. Normalize to metric.`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 256,
    system,
    tools: [tool],
    tool_choice: { type: "tool", name: "record_measurement" }, // force structured
    messages: [{ role: "user", content: `Input: "${input}"` }],
  });
  return res.content.find((b) => b.type === "tool_use").input;
}

async function main() {
  for (const input of TEST_INPUTS) {
    console.log(`\n=== Input: "${input}" ===`);

    const zero = await extract("zero-shot", false, input);
    console.log("  [zero-shot] ", JSON.stringify(zero));

    const few = await extract("few-shot", true, input);
    console.log("  [few-shot]  ", JSON.stringify(few));
  }

  console.log(
    "\nThe schema is identical in both runs — only the EXAMPLES differ.",
  );
  console.log(
    "Look at the few-shot column: same unit style (~Xg/~Xml), same",
  );
  console.log(
    "phrasing in `original_text`, same use of 'approximate'. Zero-shot",
  );
  console.log(
    "may use grams, milliliters, teaspoons interchangeably — drift.",
  );
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
