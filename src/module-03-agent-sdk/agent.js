// ===================================================================
// agent.js — the shared Agent abstraction for Module 3 onward.
// ===================================================================
// Mirrors the Claude Agent SDK's AgentDefinition shape:
//
//   new Agent({
//     name,            // identifier — used in logs, future routing
//     description,     // what this agent is for (coordinator will use this)
//     systemPrompt,    // behavior/role/constraints
//     allowedTools,    // PRINCIPLE OF LEAST PRIVILEGE — array of tool
//                      // NAMES the agent is permitted to call
//     toolCatalog,     // { name: { schema, handler } } — the universe
//                      // of tools that exist. The Agent only sees the
//                      // subset declared in allowedTools.
//     maxIterations,   // SAFETY NET only — throws if exhausted
//   })
//
// The KEY design choice: the Agent never sees tools outside its
// allowedTools list. The model literally cannot request a tool it
// wasn't given. This is enforcement at the API layer, not a
// "please don't do that" prompt instruction.
// ===================================================================

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export class Agent {
  constructor({
    name,
    description,
    systemPrompt,
    allowedTools,   // ["get_customer", "lookup_order", ...]
    toolCatalog,    // { get_customer: { schema, handler }, ... }
    hooks = {},     // { preToolUse?, postToolUse? } — Concept 3.5
    tracer = null,  // optional Tracer instance — see src/capstone/tracer.js
    maxIterations = 25,
  }) {
    this.name = name;
    this.description = description;
    this.systemPrompt = systemPrompt;
    this.allowedTools = allowedTools;
    this.hooks = hooks;
    this.tracer = tracer;
    this.maxIterations = maxIterations;

    // FILTER the universe down to this agent's whitelist.
    // Anything not in allowedTools is invisible to the model.
    this.tools = allowedTools.map((n) => {
      if (!toolCatalog[n]) throw new Error(`unknown tool in allowedTools: ${n}`);
      return toolCatalog[n].schema;
    });
    this.handlers = Object.fromEntries(
      allowedTools.map((n) => [n, toolCatalog[n].handler]),
    );
  }

  async run(userPrompt) {
    if (this.tracer) this.tracer.agentStart(this.name, userPrompt);
    const messages = [{ role: "user", content: userPrompt }];

    for (let i = 1; i <= this.maxIterations; i++) {
      if (this.tracer) this.tracer.iterStart(this.name, i);
      const res = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: this.systemPrompt,
        tools: this.tools,
        messages,
      });
      console.log(`[${this.name}] iter ${i}  stop_reason=${res.stop_reason}`);
      if (this.tracer) this.tracer.iterEnd(this.name, i, res.stop_reason, res.usage);
      messages.push({ role: "assistant", content: res.content });

      if (res.stop_reason === "end_turn") {
        const finalText = res.content.find((b) => b.type === "text")?.text ?? "";
        if (this.tracer) this.tracer.agentEnd(this.name, finalText);
        return finalText;
      }
      if (res.stop_reason !== "tool_use") {
        throw new Error(`[${this.name}] unexpected stop_reason: ${res.stop_reason}`);
      }

      // Run ALL requested tools in PARALLEL (Promise.all). When the
      // model emits multiple tool_use blocks in one assistant turn,
      // those tool calls are independent and can fan out concurrently
      // — this is exactly how the SDK's Task tool achieves parallel
      // subagent spawning (Concept 3.4).
      const toolUseBlocks = res.content.filter((b) => b.type === "tool_use");
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          // === PreToolUse HOOK (Concept 3.5) ===
          // Intercept BEFORE the handler runs. If the hook returns a
          // value, we short-circuit: the handler is never called and
          // the hook's value becomes the tool_result. This is the
          // DETERMINISTIC enforcement point (block refunds > $500 etc).
          if (this.hooks.preToolUse) {
            const intercept = await this.hooks.preToolUse({
              tool: block.name,
              input: block.input,
              agent: this.name,
            });
            if (intercept !== undefined) {
              return {
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(intercept),
                is_error: true,
              };
            }
          }

          if (this.tracer) this.tracer.toolCallRequest(this.name, i, block.name, block.input, block.id);
          const t0 = Date.now();
          const handler = this.handlers[block.name];
          let result = handler
            ? await handler(block.input)
            : { error: `tool '${block.name}' is not allowed for agent '${this.name}'` };

          // === PostToolUse HOOK (Concept 3.5) ===
          // Intercept AFTER the handler runs, BEFORE the model sees it.
          // Use for normalization, trimming, redaction, logging.
          if (this.hooks.postToolUse) {
            const transformed = await this.hooks.postToolUse({
              tool: block.name,
              input: block.input,
              result,
              agent: this.name,
            });
            if (transformed !== undefined) result = transformed;
          }
          if (this.tracer) this.tracer.toolCallResult(this.name, i, block.name, block.id, result, Date.now() - t0);

          return {
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          };
        }),
      );
      messages.push({ role: "user", content: toolResults });
    }

    throw new Error(
      `[${this.name}] aborted: hit max iterations (${this.maxIterations}) without end_turn.`,
    );
  }
}
