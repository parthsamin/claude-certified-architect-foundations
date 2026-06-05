# Module 3 directory — directory-level CLAUDE.md

> Auto-loaded by Claude Code **only when editing files in this directory**.
> Project-level rules (lab root CLAUDE.md) still apply on top of these.

## Local conventions

> These conventions govern the **hand-rolled** concept files (`01`–`05`),
> which teach the agent loop on the **Client SDK** (`@anthropic-ai/sdk`).
> The one exception is `06-real-agent-sdk.js` (`m3:sdk`): it deliberately
> imports the real **Agent SDK** (`@anthropic-ai/claude-agent-sdk`) and
> therefore does NOT use `agent.js` or the Messages API directly — it is the
> bridge that shows the real package. Don't "fix" it to match the rules below.

- The canonical `Agent` lives in `./agent.js`. The hand-rolled concept files
  evolve it across concepts — never branch into a parallel copy; extend the
  existing class via constructor options.
- Each hand-rolled concept file (`0N-<name>.js`) is **self-contained** other
  than its `import { Agent } from "./agent.js"`. Anything else needed by the
  concept is defined inline at the top of the file.
- Subagent demos in the hand-rolled files must use the `Agent` class for the
  subagent itself — do not call the Messages API directly in those files.
- Tool catalogs in this directory follow the `{ name: { schema, handler } }`
  shape. The `schema.input_schema` (snake_case) is the Anthropic API form.
