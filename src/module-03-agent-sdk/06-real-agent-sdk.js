// ===================================================================
// Module 3 · Concept 3.6 — The REAL Claude Agent SDK (the bridge)
// ===================================================================
// Every other Module-3 file hand-rolls the agent loop on top of the
// Client SDK (`@anthropic-ai/sdk` — the Messages API client). That is
// deliberate: Modules 1–3 exist to make the loop VISIBLE, because the
// exam tests how the loop actually works (stop_reason, tool_result
// plumbing, isolated subagent context, deterministic gates).
//
// THIS file is the bridge to the real thing. The exam also names the
// **Claude Agent SDK** (`@anthropic-ai/claude-agent-sdk`) as a core
// technology — a DIFFERENT package that runs the loop FOR you. The
// docs draw the line exactly:
//
//   Client SDK  (@anthropic-ai/sdk)            -> YOU write the loop
//                                                  (every other m3 file)
//   Agent SDK   (@anthropic-ai/claude-agent-sdk) -> Claude runs the loop
//                                                  (query(), this file)
//
// Concept-for-concept mapping is in revision/agent-sdk-vs-client-sdk.md.
//
// What this exercise shows, using the REAL package:
//   1. query({ prompt, options }) — the loop you no longer write.
//   2. options.allowedTools — built-in tools (Read/Glob/Grep), NOT the
//      custom {name, input_schema}+handler tools the lab hand-rolls.
//   3. options.hooks.PreToolUse — the real HookMatcher shape, used as a
//      DETERMINISTIC gate (deny Bash) — same lesson as agent.js's
//      hooks.preToolUse, different API surface.
//   4. options.agents{} + the built-in "Agent" tool — the real way to
//      spawn a subagent, vs the lab's hand-rolled Task/subagent_type.
//
// IMPORTANT — heavier than the other exercises. The TypeScript Agent
// SDK bundles and spawns the Claude Code binary as a subprocess and
// needs network + ANTHROPIC_API_KEY. If the package isn't installed or
// the subprocess can't reach the API, main()'s .catch() prints a clear
// message and exits 1 (see standards/coding-style.md) instead of a
// raw stack trace.
//
// Run me with:  npm run m3:sdk
// ===================================================================

import "dotenv/config";

// Honor the project model lock (CLAUDE.md): same model the hand-rolled
// Agent uses, so the bridge is apples-to-apples.
const MODEL = "claude-sonnet-4-6";

// -------------------------------------------------------------------
// HOOKS — the real PreToolUse shape.
//
// Two hooks registered below, mirroring the "three layers of
// enforcement" table from revision/module-03-agent-sdk.md:
//
//   * auditLog (no matcher) — fires for EVERY tool call. Pure
//     observability; returns {} to allow. This is GUARANTEED to fire
//     and proves the hook plumbing works.
//   * denyBash (matcher: "Bash") — the DETERMINISTIC gate. Returns
//     permissionDecision: "deny" so the model can never shell out,
//     no matter what the system prompt says. `deny` always wins.
//
// Note the contrast with agent.js: there, a tool simply isn't in
// `this.tools`, so the model literally cannot see it. Here, the real
// SDK's `allowedTools` is an AUTO-APPROVE list, not a hard filter — a
// tool left off it still EXISTS, it just needs permission. The hook is
// what turns "needs permission" into "hard no". That distinction is
// itself exam-relevant and is spelled out in the mapping doc.
// -------------------------------------------------------------------
const auditLog = async (input) => {
  if (input.hook_event_name !== 'PreToolUse') return {};
  console.log(`  [hook PreToolUse] ${input.tool_name}`);
  return {}; // {} === allow, unchanged
};

const denyBash = async (input) => {
  const reason = 'Bash is blocked by a deterministic PreToolUse hook (read-only agent).';
  console.log(`  [hook PreToolUse] DENY ${input.tool_name} — ${reason}`);
  return {
    // Top-level field: shown to the user.
    systemMessage: 'Shell access denied by policy; use Read/Glob/Grep instead.',
    // hookSpecificOutput: the part that actually blocks the call.
    hookSpecificOutput: {
      hookEventName: input.hook_event_name,
      permissionDecision: 'deny',
      // The reason is fed back to the MODEL so it stops retrying and
      // falls back to an allowed tool — the deterministic-gate pattern.
      permissionDecisionReason: reason,
    },
  };
};

// -------------------------------------------------------------------
// Drive one query() to completion, printing the streamed messages.
// query() returns an async generator of SDKMessage objects; the final
// answer arrives as a `result` message (subtype "success").
// -------------------------------------------------------------------
async function runQuery(label, { query }, prompt, options) {
  console.log(`\n=== ${label} ===`);
  let finalText = '';
  for await (const message of query({ prompt, options })) {
    if (message.type === 'result' && message.subtype === 'success') {
      finalText = message.result;
    }
  }
  console.log(`\n[${label}] final answer:\n${finalText}\n`);
  return finalText;
}

async function main() {
  // Import lazily so a missing dependency is caught by the .catch()
  // below with a friendly message, not an unhandled import error.
  const sdk = await import('@anthropic-ai/claude-agent-sdk');
  if (typeof sdk.query !== 'function') {
    throw new Error('@anthropic-ai/claude-agent-sdk did not export query()');
  }

  // ---------------------------------------------------------------
  // DEMO 1 — single agent: query() + allowedTools + hooks.
  //
  // A read-only "what's in this repo" agent. allowedTools auto-approves
  // the three read tools; the denyBash hook is the deterministic gate.
  // The prompt deliberately TEMPTS the model toward the shell so you
  // can watch the gate fire and the model fall back. Whether it reaches
  // for Bash at all is model-driven (opportunistic — same caveat as the
  // Task-tool parallelism lesson in 04-task-tool.js), so the deny line
  // may or may not appear; the auditLog line always will.
  // ---------------------------------------------------------------
  await runQuery('demo1: query + allowedTools + hooks', sdk,
    'Prefer shell commands where possible. How many Module 3 exercise ' +
    'files (src/module-03-agent-sdk/0*.js) are there, and what is each ' +
    'one about in one line? If a shell command is blocked, fall back to ' +
    'the file-reading tools.',
    {
      model: MODEL,
      allowedTools: ['Read', 'Glob', 'Grep'],
      maxTurns: 12,
      hooks: {
        PreToolUse: [
          { hooks: [auditLog] },              // no matcher -> every tool
          { matcher: 'Bash', hooks: [denyBash] }, // exact-match gate
        ],
      },
    },
  );

  // ---------------------------------------------------------------
  // DEMO 2 — subagents the REAL way: options.agents{} + "Agent" tool.
  //
  // The lab hand-rolls hub-and-spoke with a custom `Task` tool whose
  // `subagent_type` is an enum (03/04-*.js). The real SDK instead takes
  // a map of AgentDefinitions and exposes the built-in `Agent` tool;
  // you must include "Agent" in allowedTools to auto-approve spawns.
  //
  // Real AgentDefinition shape is {description, prompt, tools} — note
  // `prompt` (not `systemPrompt`) and `tools` (not `allowedTools`).
  // ---------------------------------------------------------------
  await runQuery('demo2: subagent via options.agents + Agent tool', sdk,
    'Use the readme-summarizer agent to summarize this project\'s README.md ' +
    'in exactly three bullet points.',
    {
      model: MODEL,
      allowedTools: ['Read', 'Glob', 'Grep', 'Agent'], // "Agent" = spawn subagents
      maxTurns: 12,
      agents: {
        'readme-summarizer': {
          description: 'Summarizes a single markdown file into terse bullets.',
          prompt:
            'You read one markdown file and return a terse bullet summary. ' +
            'Do not editorialize. Use only the file-reading tools.',
          tools: ['Read', 'Glob', 'Grep'],
          model: 'inherit',
        },
      },
      hooks: {
        // SubagentStop fires when a spawned agent finishes — the real
        // SDK's built-in observability for the fan-out the lab logs by
        // hand with `[coordinator -> researcher]` lines.
        SubagentStop: [
          { hooks: [async (input) => {
            console.log(`  [hook SubagentStop] agent_id=${input.agent_id ?? 'n/a'}`);
            return {};
          }] },
        ],
      },
    },
  );
}

main().catch((err) => {
  console.error('\nm3:sdk failed.');
  console.error(
    'This exercise needs `@anthropic-ai/claude-agent-sdk` installed ' +
    '(run `npm install`), a valid ANTHROPIC_API_KEY in .env, and network ' +
    'access (the SDK spawns the bundled Claude Code binary as a subprocess).',
  );
  console.error(`\nUnderlying error: ${err?.message ?? err}`);
  process.exit(1);
});
