// ===================================================================
// Module 8 · Concepts 8.1–8.3 — Task Decomposition
// ===================================================================
// Three patterns the exam tests:
//
//   FIXED PIPELINE (chaining, Module 6.3)
//     Steps fixed up front. Use when the task structure is predictable.
//     "metadata extraction -> data extraction -> validation -> enrichment"
//
//   DYNAMIC DECOMPOSITION
//     A coordinator agent decides subtasks at runtime based on what
//     intermediate steps return. Use for open-ended investigation.
//     ("Add tests for legacy code" -> first map structure, then prioritize)
//
//   MULTI-PASS REVIEW
//     For a 10+ file PR: per-file pass(es), THEN an integration pass.
//     The cure for attention dilution.
//
// THIS DEMO compares SINGLE-PASS vs MULTI-PASS code review on the
// same 3-file PR. The multi-pass version should catch MORE issues,
// especially the cross-file ones the single pass tends to skim past.
//
// Run me with:  npm run m8:passes
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FILES = {
  "src/auth.ts": `
export async function login(username, password) {
  // Build query with raw string interpolation
  const user = await db.query("SELECT * FROM users WHERE username = '" + username + "'");
  if (user.password === password) return user;
  return null;
}`,
  "src/payments.ts": `
import { login } from "./auth";
export async function refund(orderId, requestingUser, password) {
  const user = await login(requestingUser, password);
  if (!user) throw new Error("auth failed");
  // No authorization check beyond "logged in"
  await db.query("UPDATE orders SET refunded = 1 WHERE id = " + orderId);
}`,
  "src/admin.ts": `
import { login } from "./auth";
export async function deleteUser(targetId, requestingUser, password) {
  await login(requestingUser, password);
  // No role check — any successful login can delete any user
  await db.query("DELETE FROM users WHERE id = " + targetId);
}`,
};

const reportTool = {
  name: "report_issues",
  description: "Record issues found in code.",
  input_schema: {
    type: "object",
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            location: { type: "string" },
            issue:    { type: "string" },
            severity: { type: "string", enum: ["critical","high","medium","low"] },
          },
          required: ["location", "issue", "severity"],
        },
      },
    },
    required: ["issues"],
  },
};

async function review(prompt) {
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    tools: [reportTool],
    tool_choice: { type: "tool", name: "report_issues" },
    messages: [{ role: "user", content: prompt }],
  });
  return res.content.find((b) => b.type === "tool_use").input.issues;
}

async function singlePass() {
  const concatenated = Object.entries(FILES)
    .map(([p, c]) => `--- ${p} ---${c}`)
    .join("\n");
  return review(
    `Review the following pull request (3 files) for ALL issues — local bugs, ` +
    `cross-file issues, security, authorization, anything. Return a single list.\n\n${concatenated}`,
  );
}

async function multiPass() {
  const all = [];
  // Pass 1: per-file local issues
  for (const [path, code] of Object.entries(FILES)) {
    const issues = await review(
      `Review ONLY this file for LOCAL issues — bugs visible in the file itself. ` +
      `Do not speculate about other files.\n\n--- ${path} ---${code}`,
    );
    issues.forEach((i) => all.push({ ...i, _phase: "per-file" }));
  }
  // Pass 2: integration — cross-file dependencies
  const concatenated = Object.entries(FILES)
    .map(([p, c]) => `--- ${p} ---${c}`)
    .join("\n");
  const integration = await review(
    `INTEGRATION PASS. All three files have been reviewed in isolation. Now find ` +
    `issues that ONLY become visible when considering how the files INTERACT — ` +
    `authorization gaps across module boundaries, missing role checks where one ` +
    `module trusts another's auth, SQL-injection vectors that propagate from one ` +
    `file's input handling to another's database call. Do NOT repeat per-file ` +
    `local issues.\n\n${concatenated}`,
  );
  integration.forEach((i) => all.push({ ...i, _phase: "integration" }));
  return all;
}

function summarize(label, issues) {
  console.log(`\n=== ${label} — ${issues.length} issue(s) ===`);
  for (const i of issues) {
    const phase = i._phase ? `[${i._phase}] ` : "";
    console.log(`  ${phase}${i.severity.toUpperCase().padEnd(8)} ${i.location}: ${i.issue}`);
  }
}

async function main() {
  console.log("Reviewing a 3-file PR with deliberate cross-file authorization holes...");
  const single = await singlePass();
  summarize("SINGLE-PASS review", single);
  const multi = await multiPass();
  summarize("MULTI-PASS review", multi);

  console.log(
    "\nExpect the multi-pass run to surface MORE issues — especially the cross-",
  );
  console.log("file authorization gaps (deleteUser has no role check; refund() trusts");
  console.log("a plain login). Single-pass tends to flag the SQL injection and stop.");
}

main().catch((err) => {
  console.error("Run failed:", err.message);
  process.exit(1);
});
