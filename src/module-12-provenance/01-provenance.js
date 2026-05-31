// ===================================================================
// Module 12 · Concepts 12.1–12.4 — Preserving Provenance
// ===================================================================
// FOUR rules the exam tests:
//
//   12.1 ATTRIBUTION LOSS — never strip a claim from its source.
//        Bad: "The AI music market is $3.2B."
//        Good: { claim, source_name, source_url, publication_date, confidence }
//
//   12.2 CONFLICTING DATA — when sources disagree, DO NOT pick one.
//        Preserve BOTH with attribution and let the consumer decide.
//        Include possible_explanation when you can.
//
//   12.3 INCLUDE DATES — a difference between 2023 and 2024 numbers
//        is GROWTH, not contradiction. Without dates you'd flag it
//        as a conflict.
//
//   12.4 RENDER BY CONTENT TYPE — financial data -> tables,
//        analysis -> prose, technical findings -> structured lists,
//        time series -> chronological order.
//
// THIS DEMO synthesizes a brief on "AI in music streaming" from TWO
// findings with overlapping but slightly different numbers. We run
// it TWO ways:
//   BAD synthesis  — no source preservation, no dates → blends numbers,
//                    looks confident, hides the conflict.
//   GOOD synthesis — full provenance + dates → presents both, lets
//                    the reader see growth/methodology differences.
//
// Run me with:  npm run m12:prov
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Two findings on the SAME topic, different sources, different dates,
// different methodology. They're not necessarily in conflict — the
// difference is likely growth — but only the GOOD synthesis can show that.
const FINDINGS = [
  {
    claim: "Share of AI-generated music on streaming platforms",
    value: "8%",
    source_name: "Music Industry Association Survey",
    source_url: "https://example.org/mia-2023",
    publication_date: "2023-09",
    methodology: "Survey of 500 labels",
    confidence: 0.7,
  },
  {
    claim: "Share of AI-generated music on streaming platforms",
    value: "12%",
    source_name: "Spotify Annual Report",
    source_url: "https://example.com/spotify-2024",
    publication_date: "2024-03",
    methodology: "Automated audio classification of new uploads",
    confidence: 0.9,
  },
];

async function synthesize(strategy) {
  let prompt;
  if (strategy === "bad") {
    // Source/date stripped — the model only sees the raw values.
    prompt =
      `Two researchers reported the share of AI-generated music on streaming: 8% and 12%. ` +
      `Write a 3-sentence brief on the state of AI in music streaming.`;
  } else {
    prompt =
      `Two findings on the share of AI-generated music on streaming, WITH attribution and dates:\n\n` +
      JSON.stringify(FINDINGS, null, 2) +
      `\n\nWrite a 3-5 sentence brief. PRESERVE source names and dates inline. ` +
      `If the values differ, do NOT pick one — present both with attribution and offer ` +
      `a plausible explanation (growth between dates, methodology differences). ` +
      `Where useful, render numbers in a chronological list.`;
  }
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [{ role: "user", content: prompt }],
  });
  return res.content[0].text;
}

async function main() {
  console.log("\n############ BAD: no provenance, no dates ############");
  console.log(await synthesize("bad"));
  console.log(
    "\n^ Note: the brief silently averaged / picked between 8% and 12%. The reader",
  );
  console.log("can't tell which source it trusted, when those numbers are from, or whether");
  console.log("the difference is a methodology divergence or a year of growth.");

  console.log("\n\n############ GOOD: claims attributed, dates preserved ############");
  console.log(await synthesize("good"));
  console.log(
    "\n^ Note: both sources are named, dates are inline, and the brief frames the",
  );
  console.log("difference as plausible YoY growth — not a contradiction. This is the");
  console.log("Module 12.3 fix: dates turn 'conflict' into 'time series.'");
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
