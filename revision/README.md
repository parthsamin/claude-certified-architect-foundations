# Revision Notes — Claude Certified Architect

Condensed, exam-focused recaps of each module. One file per module: concept
summaries, quick-reference tables, and an **Exam traps** section at the end of
each — the symptom → diagnosis patterns the exam tests.

Use these for fast review; use the `src/` exercises for hands-on practice.

## Index

| Module | File | Exam domains |
|---|---|---|
| 1 — Claude API Fundamentals | [module-01-api-fundamentals.md](module-01-api-fundamentals.md) | Foundations (all) |
| 2 — Tools and `tool_use` | [module-02-tools.md](module-02-tools.md) | D2, D4 |
| 3 — Agent SDK and Agentic Loops | [module-03-agent-sdk.md](module-03-agent-sdk.md) | D1 |
| 4 — Model Context Protocol (MCP) | [module-04-mcp.md](module-04-mcp.md) | D2 |
| 5 — Claude Code Configuration | [module-05-claude-code.md](module-05-claude-code.md) | D3 |
| 6 — Prompt Engineering | [module-06-prompt-engineering.md](module-06-prompt-engineering.md) | D4 |
| 7 — Message Batches API | [module-07-batches.md](module-07-batches.md) | D4 |
| 8 — Task Decomposition | [module-08-decomposition.md](module-08-decomposition.md) | D1 |
| 9 — Escalation & Human-in-the-Loop | [module-09-escalation.md](module-09-escalation.md) | D5 |
| 10 — Error Handling in Multi-Agent Systems | [module-10-error-handling.md](module-10-error-handling.md) | D5 |
| 11 — Context Management | [module-11-context-mgmt.md](module-11-context-mgmt.md) | D5 |
| 12 — Preserving Provenance | [module-12-provenance.md](module-12-provenance.md) | D5 |
| 13 — Claude Code Built-in Tools | [module-13-claude-code-tools.md](module-13-claude-code-tools.md) | D2, D3 |
| Capstone — Multi-Agent Research Network | [capstone-and-exam-prep.md](capstone-and-exam-prep.md) | All |
| Reference — Client SDK vs Agent SDK | [agent-sdk-vs-client-sdk.md](agent-sdk-vs-client-sdk.md) | D1 — maps the lab's hand-rolled loop to the real `@anthropic-ai/claude-agent-sdk` |
| Official-guide deltas | [official-guide-deltas.md](official-guide-deltas.md) | All — patterns the official Anthropic guide emphasizes more than the community guide |

## Exam at a glance

| Domain | Weight |
|---|---|
| 1. Agent architecture and orchestration | 27% |
| 2. Tool design and MCP integration | 18% |
| 3. Claude Code configuration and workflows | 20% |
| 4. Prompt engineering and structured output | 20% |
| 5. Context management and reliability | 15% |

Format: multiple choice (1 of 4), 100–1000 scale, **passing 720**, no guessing
penalty (answer everything), **4 of 6 scenarios** randomly selected.

## Official resources

The **Claude Certified Architect – Foundations** certification validates that you
can make informed tradeoff decisions when building real-world solutions with
Claude, across **Claude Code**, the **Claude Agent SDK**, the **Claude API**, and
**MCP**.

- [Official Exam Guide (PDF)](https://everpath-course-content.s3-accelerate.amazonaws.com/instructor%2F8lsy243ftffjjy1cx9lm3o2bw%2Fpublic%2F1773274827%2FClaude+Certified+Architect+%E2%80%93+Foundations+Certification+Exam+Guide.pdf)
- [FAQ (PDF)](https://everpath-course-content.s3-accelerate.amazonaws.com/instructor%2F8lsy243ftffjjy1cx9lm3o2bw%2Fpublic%2F1773276532%2FClaude+Certified+Architect+-+Foundations+%28CCA-F%29+FAQs+%281%29.pdf)
- [Enroll at anthropic.skilljar.com](https://anthropic.skilljar.com/) — a **practice exam** is available once enrolled.

The exam is currently **open to partner organizations only**.
