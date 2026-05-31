// ===================================================================
// Module 7 · Concept 7.1–7.5 — Message Batches API
// ===================================================================
// The Batches API lets you submit MANY requests asynchronously:
//   - 50% cheaper than synchronous calls
//   - Up to 24 hours latency (no SLA — usually minutes for small jobs)
//   - One request = one response (NO multi-turn tool calling)
//   - custom_id correlates each result back to its input
//
// WHEN TO USE BATCH (exam):
//   - Overnight reports, weekly audits, 10k-document bulk processing.
// WHEN NOT:
//   - Anything a HUMAN IS WAITING for (CI checks, interactive review).
//
// THE custom_id RULE:
//   - Set a meaningful custom_id per request (doc id, ticket id, etc).
//   - On failure, you can RESUBMIT ONLY THE FAILED ITEMS by their id —
//     you do NOT have to re-process the successful ones.
//
// SLA PLANNING:
//   If you need results in 30 hours and batches take up to 24 hours,
//   your submission window is 30 - 24 = 6 hours. Submit no later than
//   24h before the deadline.
//
// THIS DEMO submits 5 small classification requests with meaningful
// custom_ids, polls for completion, and PROVES the correlation: the
// output's custom_id is what tells you which result belongs to which
// input. Without it you would have an unordered pile of answers.
//
// Run me with:  npm run m7:batches
// (Note: may take a few minutes; poll loop runs up to ~10 min.)
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Five tickets to classify in one batch — meaningful custom_ids.
const TICKETS = [
  { id: "TKT-001", text: "App crashes when I click Export. Cannot use the product at all." },
  { id: "TKT-002", text: "Could you add dark mode? Would be nice for night work." },
  { id: "TKT-003", text: "User session tokens are stored in plaintext in the logs. Found via audit." },
  { id: "TKT-004", text: "Search returns wrong results when query contains an apostrophe. Workaround: use quotes." },
  { id: "TKT-005", text: "The CTA button is the wrong shade of blue. Brand says #3366FF, app uses #336699." },
];

function buildRequest(ticket) {
  return {
    custom_id: ticket.id, // <-- THIS is what correlates the answer back to this ticket
    params: {
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system:
        "You triage bug reports. Reply with ONLY a JSON object of the form " +
        '{"priority":"P0|P1|P2|P3","one_line_reason":"..."}. ' +
        "P0=crash/data-loss, P1=security, P2=functional with workaround, P3=cosmetic.",
      messages: [{ role: "user", content: ticket.text }],
    },
  };
}

async function main() {
  console.log(`Submitting batch of ${TICKETS.length} ticket classifications...`);
  const batch = await client.messages.batches.create({
    requests: TICKETS.map(buildRequest),
  });
  console.log(`Batch id: ${batch.id}`);
  console.log(`Initial status: ${batch.processing_status}`);

  // Poll for completion. Real production code uses backoff and a
  // longer ceiling; here we cap at ~10 minutes for the demo.
  const startedAt = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000;
  let current = batch;
  while (current.processing_status !== "ended") {
    if (Date.now() - startedAt > TIMEOUT_MS) {
      console.error("Timed out waiting; check the batch later via its id.");
      process.exit(1);
    }
    await new Promise((r) => setTimeout(r, 5000));
    current = await client.messages.batches.retrieve(batch.id);
    process.stdout.write(`.`);
  }
  console.log(`\nBatch ended. Counts:`, current.request_counts);

  // FETCH the results. The completed batch carries a `results_url`
  // pointing to a JSONL endpoint. We fetch it directly with the API
  // key — this is robust across SDK versions whose `.results()`
  // iteration shape differs (e.g. v0.39's iterator was reported as
  // "not async iterable" by Parth's run).
  //
  // Each JSONL line is a per-request record. `custom_id` is how we
  // correlate the answer back to its TICKET — without it, results
  // are an anonymous pile.
  const finalBatch = await client.messages.batches.retrieve(batch.id);
  if (!finalBatch.results_url) {
    console.error("Batch has no results_url — cannot fetch results.");
    process.exit(1);
  }
  const httpRes = await fetch(finalBatch.results_url, {
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!httpRes.ok) {
    console.error(`Failed to fetch results: HTTP ${httpRes.status}`);
    console.error(await httpRes.text());
    process.exit(1);
  }
  const jsonl = await httpRes.text();
  const indexed = new Map(TICKETS.map((t) => [t.id, t]));

  console.log(`\n--- Results (correlated via custom_id) ---`);
  for (const line of jsonl.trim().split("\n")) {
    if (!line) continue;
    const result = JSON.parse(line);
    const original = indexed.get(result.custom_id);
    const head = `[${result.custom_id}] ${result.result?.type ?? "?"}`;
    if (result.result?.type === "succeeded") {
      const text = result.result.message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      console.log(`${head}  input: "${original.text.slice(0, 50)}..."`);
      console.log(`            output: ${text}`);
    } else {
      console.log(`${head}  -> ${JSON.stringify(result.result)}`);
    }
  }

  console.log(
    "\nNotice the correlation: the custom_id in each result told us which TKT it",
  );
  console.log("answered. Without custom_id you would have 5 anonymous answers in some order.");
  console.log("On a real failure, you would re-submit ONLY the failed ids — Module 7.4.");
}

main().catch((err) => {
  console.error("Run failed:", err);
  process.exit(1);
});
