// ===================================================================
// Module 2 · Concept 2.3 — JSON Schemas for Structured Output
// ===================================================================
// tool_use + a JSON Schema is the MOST RELIABLE way to get structured
// output from Claude. It guarantees:
//   - syntactically valid JSON (no missing braces / trailing commas)
//   - the required STRUCTURE (required fields will be present)
// It does NOT guarantee SEMANTIC correctness — values can still be
// wrong or invented. (More on that in Concept 2.4.)
//
// THE BIG DESIGN TRAP shown here:
//   A `required` field FORCES the model to output a value. If the
//   source data does not contain that value, the model FABRICATES one
//   rather than omit a required field.
//   Fix: make absent-able fields NULLABLE  (type: ["string","null"])
//   and add enum escape hatches ("unclear", "other").
//
// We extract from a ticket that is DELIBERATELY missing an account ID
// and a severity, under a BAD schema and a GOOD schema. Watch the BAD
// one hallucinate an account ID; the GOOD one returns null.
//
// Run me with:  npm run m2:schema
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// The ticket. Note: NO account ID anywhere, and severity is NOT stated.
const TICKET =
  "Hey — the export button doesn't do anything when I click it. " +
  "Nothing happens at all. Pretty annoying, please look into it.";

// -------------------------------------------------------------------
// BAD SCHEMA — everything `required`, no nullable types, no escape
// hatch. The model MUST produce an account_id and a severity even
// though the ticket contains neither.
// -------------------------------------------------------------------
const badSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["bug", "feature", "docs"] },
    severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
    account_id: { type: "string", description: "The customer's account ID" },
    summary: { type: "string" },
  },
  required: ["category", "severity", "account_id", "summary"],
};

// -------------------------------------------------------------------
// GOOD SCHEMA — same intent, designed for missing data:
//   - account_id is NULLABLE  -> model can honestly return null
//   - severity is NULLABLE    -> not stated => null, not a guess
//   - category enum has "unclear" -> honest uncertainty over a wrong label
//   - confidence number       -> the model self-reports certainty
//   - only genuinely-always-present fields stay required
// -------------------------------------------------------------------
const goodSchema = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["bug", "feature", "docs", "unclear"] },
    severity: {
      type: ["string", "null"],
      enum: ["critical", "high", "medium", "low", null],
      description: "Null if the ticket does not state or imply a severity",
    },
    account_id: {
      type: ["string", "null"],
      description: "Null if no account ID appears in the ticket",
    },
    summary: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["category", "summary", "confidence"],
};

async function extract(label, schema) {
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    tools: [
      {
        name: "record_ticket",
        description: "Record the structured fields extracted from a support ticket.",
        input_schema: schema,
      },
    ],
    // Force the extraction tool -> guaranteed structured output.
    tool_choice: { type: "tool", name: "record_ticket" },
    messages: [{ role: "user", content: `Extract fields from this ticket:\n\n${TICKET}` }],
  });
  const out = res.content.find((b) => b.type === "tool_use").input;
  console.log(`\n[${label}]`);
  console.log(JSON.stringify(out, null, 2));
  return out;
}

async function main() {
  console.log("TICKET:\n  " + TICKET);

  const bad = await extract("BAD SCHEMA (all required, no nulls)", badSchema);
  console.log("  ^ account_id was NOT in the ticket. A required field");
  console.log("    forced the model to INVENT one:", JSON.stringify(bad.account_id));

  const good = await extract("GOOD SCHEMA (nullable + 'unclear')", goodSchema);
  console.log("  ^ account_id is nullable, so the model can be honest:",
    JSON.stringify(good.account_id));

  console.log("\nLesson: 'required' is a promise the data is ALWAYS there.");
  console.log("If it is not, you are asking the model to hallucinate.");
}

main().catch((err) => {
  console.error("Request failed:", err.message);
  process.exit(1);
});
