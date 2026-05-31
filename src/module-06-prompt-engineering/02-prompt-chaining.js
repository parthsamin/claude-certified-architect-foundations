// ===================================================================
// Module 6 · Concept 6.3 — Prompt Chaining
// ===================================================================
// Prompt chaining = break a complex task into a SEQUENCE of focused
// steps. Each step has ONE goal; its output feeds the next step.
//
// Why this beats one big prompt:
//   - "Attention dilution" — when you feed many files / many tasks
//     into one call, the model gives shallow commentary on most and
//     misses real bugs in some.
//   - Each chained step has full attention budget on its narrow input.
//   - Cross-file work (integration) gets its OWN step instead of being
//     squeezed in alongside per-file analysis.
//
// Chaining vs dynamic decomposition (exam-tested distinction):
//   - Chaining   = the STEPS are fixed up front. Predictable,
//                  repeatable: code review per file, then integration.
//   - Dynamic    = the agent (a coordinator) decides AT RUNTIME which
//                  subtasks to spawn. Use for open-ended investigation
//                  where you can't know the subtasks until you start.
//                  (That's the Module-3 coordinator/Task pattern.)
//
// Demo: three-step code review.
//   Step 1: analyze auth.ts (local issues only)
//   Step 2: analyze database.ts (local issues only)
//   Step 3: integration pass — find issues at the BOUNDARY between
//           the two files, given both prior outputs.
//
// Run me with:  npm run m6:chain
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AUTH_TS = `// src/auth.ts
export async function login(username, password) {
  const user = await db.query("SELECT * FROM users WHERE username = '" + username + "'");
  if (user.password === password) return user;
  return null;
}`;

const DATABASE_TS = `// src/database.ts
export const db = {
  query: async (sql) => {
    // No parameterized queries; SQL is interpolated by callers.
    return runRaw(sql);
  },
};`;

const issuesSchema = {
  name: "report_issues",
  description: "Record a list of issues found in code.",
  input_schema: {
    type: "object",
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            location: { type: "string", description: "file:line or file:section" },
            issue:    { type: "string" },
            severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          },
          required: ["location", "issue", "severity"],
        },
      },
    },
    required: ["issues"],
  },
};

async function reportIssues(prompt) {
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    tools: [issuesSchema],
    tool_choice: { type: "tool", name: "report_issues" },
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.find((b) => b.type === "tool_use").input.issues;
}

async function main() {
  // ----- Step 1: auth.ts in isolation -----
  console.log("\n=== Step 1: review auth.ts (local issues only) ===");
  const step1 = await reportIssues(
    `Review this single file for LOCAL issues only — bugs visible in the file itself. ` +
    `Do NOT speculate about other files. Return all findings.\n\n${AUTH_TS}`,
  );
  console.log(JSON.stringify(step1, null, 2));

  // ----- Step 2: database.ts in isolation -----
  console.log("\n=== Step 2: review database.ts (local issues only) ===");
  const step2 = await reportIssues(
    `Review this single file for LOCAL issues only. Do NOT speculate about callers.\n\n${DATABASE_TS}`,
  );
  console.log(JSON.stringify(step2, null, 2));

  // ----- Step 3: integration pass — cross-file boundary -----
  console.log("\n=== Step 3: integration pass (cross-file issues) ===");
  const step3 = await reportIssues(
    `Two files have been reviewed in isolation. Now look for issues at the BOUNDARY ` +
    `between them — places where one file's behavior interacts with the other in a ` +
    `dangerous or surprising way. Output ONLY cross-file findings; do not repeat ` +
    `the per-file issues.\n\n` +
    `--- auth.ts ---\n${AUTH_TS}\n\n` +
    `--- database.ts ---\n${DATABASE_TS}\n\n` +
    `--- prior auth.ts findings ---\n${JSON.stringify(step1, null, 2)}\n\n` +
    `--- prior database.ts findings ---\n${JSON.stringify(step2, null, 2)}`,
  );
  console.log(JSON.stringify(step3, null, 2));

  console.log(
    "\nThe SQL-injection problem here actually only surfaces clearly in step 3,",
  );
  console.log("when both files' behaviors are considered together. Each step had");
  console.log("full attention on its narrow input — no dilution.");
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
