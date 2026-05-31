# Capstone + Final Exam Prep

## Capstone — Multi-Agent Research Network

Built at `src/capstone/`. Integrates **all 13 modules** into the
Scenario-3 system from the official exam guide:

| Layer | Patterns used | Where in code |
|---|---|---|
| Loop | Module 1 — `stop_reason` branching | `src/module-03-agent-sdk/agent.js` |
| Tool design | Module 2 — descriptions, schemas, structured errors | `kb-server.js`, `research-network.js` |
| Agent shape | Module 3 — `AgentDefinition`, `Task`, parallel, hooks | `Agent` class + coordinator |
| MCP | Module 4 — server, config, isError, resources | `kb-server.js`, `mcp-host.js` |
| (Claude Code config) | Module 5 — n/a for runtime; informs project layout | `CLAUDE.md`, `standards/`, etc. |
| Prompts | Module 6 — chaining, criteria, self-correction, validation | researcher and synthesizer prompts |
| (Batches) | Module 7 — n/a for interactive flow; would apply to bulk research | — |
| Decomposition | Module 8 — fixed pipeline + dynamic (coordinator chooses topics) | coordinator orchestration |
| Escalation | Module 9 — structured handoff (would fire on unfixable validation) | validator + retry loop hook point |
| Errors | Module 10 — structured errors, coverage annotations | researcher + synthesizer |
| Context | Module 11 — fact block (catalog), state persistence | `state.json` after each subagent |
| Provenance | Module 12 — sources + dates preserved end-to-end | researcher → synthesizer wiring |
| Built-in tools | Module 13 — n/a for runtime (informs Claude Code workflow) | — |

### Run it

```bash
npm run capstone
```

Observe in the logs:

- `[coordinator] -> researcher_art / researcher_music / researcher_lit START`
  bunched close together → **parallel spawn** working.
- `[hook PreToolUse] coordinator calling Task (researcher_*)` → audit
  trail from the hook.
- `state.json` updates after each subagent → **crash recoverable**.
- `=== FINAL REPORT ===` shows a structured report with section coverage
  labels and bullets carrying `source_name` + `publication_date`.
- The `music` section should preserve **both** the 2023 MIA finding
  (8%) and the 2024 Spotify finding (12%) **with their dates** — the
  conflict-resolution-by-attribution pattern from Module 12.

---

## Final exam prep

You're done with the curriculum. The remaining work is **dry-runs against
realistic questions**.

### What to do next

1. **Re-read every `revision/module-*.md` file once.** The exam-trap
   sections are the highest-leverage pages — symptom→diagnosis pairs
   are the exact shape the exam uses.
2. **Run every `npm run mN:slug` once if you haven't.** Empirical
   recall sticks better than reading.
3. **Take the practice tests in `guide_en.MD`:**
   - "Examples of Exam Questions with Explanations" (around line 1938) —
     12 example questions across multiple scenarios, with explanations.
   - "Practice Test" (around line 2120) — 28+ multiple-choice questions.
   Both are graded against the same difficulty calibration as the real
   exam. Take them **timed**, **without re-reading the chapters first**,
   then check answers and review wrong ones.
4. **Pay extra attention to Domain 1 (27%)** — Agent Architecture &
   Orchestration. It's the biggest slice and the densest in surprises.

### Exam mechanics reminders

- Passing score: **720** (scale 100–1000).
- **No guessing penalty** — answer every question, even if unsure.
- 4 of 8 scenarios randomly selected per exam.
- Multiple choice, 1 correct of 4 options.

### Symptom→diagnosis cheatsheet

A condensed pass over the highest-frequency trap patterns:

| Symptom | First-line diagnosis |
|---|---|
| Agent shows incomplete answers | `stop_reason: "max_tokens"` not checked (1.3) |
| Agent stops after one tool call | Loop is an `if`, not `while` (1.4) |
| Agent forgets earlier conversation | History not resent / assistant turns not appended (1.2) |
| Agent over-calls a tool on irrelevant messages | System-prompt wording over-associates the tool (1.5) |
| Long session loses exact numbers | Summarization drift (1.6); use fact block (11.1) |
| Two similar tools confused | Descriptions overlap; make them contrastive (2.1) |
| Need JSON output, never prose | `tool_choice: any` or `tool` (2.2) |
| Extractor invents missing fields | Field marked required; make nullable (2.3) |
| Valid JSON but wrong values | Semantic error; validator + retry (2.4) |
| Agent retries permanently-failed op forever | `isRetryable: false` missing/ignored (4.4) |
| Issues refund despite system-prompt rule | Use `PreToolUse` hook, not prompt (3.5) |
| Synthesis missing data the researcher found | Explicit context not passed in subagent prompt (3.3) |
| 3 parallel-able subagent calls take 3× latency | Coordinator issued them in separate turns; fan out (3.4) |
| Team standards not applied for new contributor | File at `~/.claude/CLAUDE.md`, should be project (5.1) |
| CI Claude job hangs forever | Missing `-p` (5.6) |
| Bot defends the code it wrote | Reviewer = generator; split (5.6) |
| Output format drifts run-to-run | Few-shot + normalization rules (6.1) |
| Classifier inconsistent on edge cases | Explicit FLAG / DO-NOT-FLAG criteria (6.2) |
| Bot reviews 14 files at once and misses bugs | Attention dilution → multi-pass (8.3) |
| Customer "I want a manager" → bot tries to solve | Immediate escalation, do NOT attempt (9.1) |
| Subagent fails, synthesis hides it | Coverage annotation missing (10.4) |
| Long investigation crashes, restart from scratch | Structured state persistence (11.6) |
| Multi-source report has confident numbers, no citations | Attribution loss (12.1) |
| 10% vs 15% across sources called a contradiction | Check dates — could be growth (12.3) |

Carry that table into the exam mentally. Most questions will resolve
into one of those rows.

Good luck.
