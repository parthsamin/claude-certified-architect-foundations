// ===================================================================
// Module 10 · Concepts 10.1–10.4 — Error Handling in Multi-Agent Systems
// ===================================================================
// FOUR error CATEGORIES the exam expects you to classify into:
//   Transient   timeout, 503, network    -> retry with backoff
//   Validation  bad input shape          -> modify request, retry
//   Business    policy / threshold       -> explain, propose alternative
//   Permission  access denied            -> escalate
//
// FOUR ANTI-PATTERNS (and their fixes):
//   X  Generic "search unavailable"      -> return error type + query + partial
//   X  Silent suppression (empty=success)-> distinguish "no results" from "failure"
//   X  Abort whole workflow on one fail  -> continue with partial; ANNOTATE GAPS
//   X  Infinite retries inside subagent  -> 1–2 retries local, then propagate
//
// STRUCTURED SUBAGENT ERROR shape:
//   { status, failure_type, attempted_query, partial_results,
//     alternative_approaches, coverage_impact }
//
// COVERAGE ANNOTATIONS in the synthesis:
//   "### Music (PARTIAL COVERAGE — search agent timeout)"
//   The reader can immediately see which sections are reliable.
//
// THIS DEMO has THREE mock research subagents. The "music" one
// deliberately FAILS (timeout simulated). We compare TWO synthesis
// strategies on the same partial-failure scenario:
//   BAD:   silently drops the music section -> reader doesn't know
//   GOOD:  includes a "PARTIAL COVERAGE" annotation -> reader sees the gap
//
// Run me with:  npm run m10:coverage
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Simulate three subagents — two succeed, one fails with a STRUCTURED error.
const subagentResults = [
  {
    topic: "Visual art",
    status: "success",
    findings: "Generative-AI tools now produce gallery-grade images; market adoption among illustrators is ~28% (Adobe, 2025).",
  },
  {
    topic: "Music",
    status: "partial_failure",
    failure_type: "timeout",
    attempted_query: "AI impact on music industry 2024-2026",
    partial_results: [
      "Spotify reported ~12% of new uploads include AI-generated stems (Annual Report 2024).",
    ],
    alternative_approaches: [
      "Try a narrower query: 'AI music composition tools 2025'",
      "Switch from web search to the licensed industry-report MCP server",
    ],
    coverage_impact: "Not covered: AI in music distribution and licensing.",
  },
  {
    topic: "Literature",
    status: "success",
    findings: "Major publishers piloted AI-assisted translation in 2025; reception mixed (PEN America survey).",
  },
];

async function synthesize(strategy) {
  const successful = subagentResults.filter((r) => r.status === "success");
  const failed = subagentResults.filter((r) => r.status !== "success");

  let payload;
  if (strategy === "bad") {
    payload =
      `Write a short report titled "AI Impact on Creative Industries" based on the following ` +
      `research findings:\n\n` +
      successful.map((r) => `## ${r.topic}\n${r.findings}`).join("\n\n");
    // The failed agent's existence is SILENTLY HIDDEN from the writer.
  } else {
    payload =
      `Write a short report titled "AI Impact on Creative Industries". Use these findings ` +
      `from research subagents. Sections from FAILED subagents must be included with the ` +
      `header marked "(PARTIAL COVERAGE — <reason>)" and include only the partial results plus ` +
      `a one-line note about the gap. Do NOT pretend missing sections succeeded.\n\n` +
      successful.map((r) => `## ${r.topic} (FULL COVERAGE)\n${r.findings}`).join("\n\n") +
      "\n\n" +
      failed.map((f) => (
        `## ${f.topic} (PARTIAL COVERAGE — ${f.failure_type})\n` +
        `Attempted query: ${f.attempted_query}\n` +
        `Partial results: ${f.partial_results.join("; ")}\n` +
        `Coverage gap: ${f.coverage_impact}`
      )).join("\n\n");
  }

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 700,
    system: "You are a research synthesizer. Produce a clean markdown report.",
    messages: [{ role: "user", content: payload }],
  });
  return res.content.find((b) => b.type === "text").text;
}

async function main() {
  console.log("\n############ BAD: silently drops the failed section ############");
  console.log(await synthesize("bad"));
  console.log(
    "\n^ Note: the reader cannot tell that 'Music' was a partial failure. " +
    "The report APPEARS complete. This is the 'silent suppression' anti-pattern.",
  );

  console.log("\n\n############ GOOD: coverage annotations preserve the gap ############");
  console.log(await synthesize("good"));
  console.log(
    "\n^ Note: the 'PARTIAL COVERAGE' marker on Music tells the reader exactly " +
    "what's reliable and what is not. The gap is explicit, not hidden.",
  );
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
