# Claude Architect Lab

Hands-on training repo for the **Claude Certified Architect — Foundations** certification.

We build one module at a time. Each module: a short theory briefing, a coding exercise
you run yourself, and a quick quiz. By the end, the `src/` tree becomes a working
multi-agent research network system.

## One-time setup

```bash
cd claude-architect-lab
npm install
cp .env.example .env       # then paste your real ANTHROPIC_API_KEY into .env
```

## Modules

| # | Module | Exam domain |
|---|--------|-------------|
| 1 | Claude API Fundamentals | Foundations |
| 2 | Tools and tool_use | D2 / D4 |
| 3 | Agent SDK and Agentic Loops | D1 |
| 4 | Model Context Protocol (MCP) | D2 |
| 5 | Claude Code Configuration | D3 |
| 6 | Prompt Engineering | D4 |
| 7 | Message Batches API | D4 |
| 8 | Task Decomposition | D1 |
| 9 | Escalation & Human-in-the-Loop | D5 |
| 10 | Error Handling in Multi-Agent Systems | D5 |
| 11 | Context Management | D5 |
| 12 | Preserving Provenance | D5 |
| 13 | Claude Code Built-in Tools | D2 / D3 |
| — | Capstone: Multi-Agent Research Network | All |

## Running a module exercise

Each module has npm scripts, e.g. `npm run m1:hello`.
