# Module 3 directory — directory-level CLAUDE.md

> Auto-loaded by Claude Code **only when editing files in this directory**.
> Project-level rules (lab root CLAUDE.md) still apply on top of these.

## Local conventions

- The canonical `Agent` lives in `./agent.js`. Module 3 exercises evolve it
  across concepts — never branch into a parallel copy; extend the existing
  class via constructor options.
- Each concept file (`0N-<name>.js`) is **self-contained** other than its
  `import { Agent } from "./agent.js"`. Anything else needed by the concept
  is defined inline at the top of the file.
- Subagent demos must use the `Agent` class for the subagent itself —
  do not call the Messages API directly in this directory.
- Tool catalogs in this directory follow the `{ name: { schema, handler } }`
  shape. The `schema.input_schema` (snake_case) is the Anthropic API form.
