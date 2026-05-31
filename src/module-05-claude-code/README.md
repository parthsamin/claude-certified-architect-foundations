# Module 5 — Claude Code config examples

Claude Code looks for configuration under a project's `.claude/` directory.
In the lab sandbox that path is protected by the host, so the example files
for Module 5 live here under `src/module-05-claude-code/` instead.

The **content** of each file is exactly what would live in the real location.
The path mapping:

| Lab location | Real Claude Code location |
|---|---|
| `src/module-05-claude-code/rules/testing.md` | `.claude/rules/testing.md` |
| `src/module-05-claude-code/rules/mcp.md` | `.claude/rules/mcp.md` |
| `src/module-05-claude-code/rules/agent-loop.md` | `.claude/rules/agent-loop.md` |
| `src/module-05-claude-code/commands/review.md` (later) | `.claude/commands/review.md` |
| `src/module-05-claude-code/skills/code-audit/SKILL.md` (later) | `.claude/skills/code-audit/SKILL.md` |

For the exam, what matters is the **format** (YAML frontmatter with `paths`,
the body in markdown) and the **rules** (when to use rules vs CLAUDE.md vs
directory-level CLAUDE.md). All of those are intact here.
