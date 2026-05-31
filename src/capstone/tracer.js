// ===================================================================
// tracer.js — opt-in trace recorder for the Agent class
// ===================================================================
// Pass a `Tracer` instance into `new Agent({ ..., tracer })` and the
// agent loop will emit a structured event for every meaningful
// lifecycle point:
//
//   agent_start           an agent's run() begins
//   iter_start            an API trip starts
//   iter_end              an API trip returns (stop_reason captured)
//   tool_call_request     a tool_use block is about to be executed
//   tool_call_result      the tool handler returned (ms latency captured)
//   agent_end             the agent's run() returns end_turn
//
// Coordinator-level events (emitted by capstone code, not the Agent):
//   subagent_spawn        coordinator's Task handler invoked a subagent
//   subagent_return       that subagent's run() returned
//
// At the end of a run, call:
//   tracer.writeJSON(path)      — raw events
//   tracer.writeMermaid(path)   — mermaid sequence diagram
//   tracer.printSummary()       — ASCII tree to stdout
//
// Reusable beyond the capstone — any Module 3+ demo can opt in by
// constructing a Tracer and passing it to the Agent.
// ===================================================================

import fs from "node:fs";

function trim(value, max = 120) {
  let s;
  if (typeof value === "string") s = value;
  else {
    try { s = JSON.stringify(value); } catch { s = String(value); }
  }
  s = s.replace(/\s+/g, " ");
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function mermaidId(name) {
  // Mermaid identifiers may not contain spaces. Use a stable replacement.
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

export class Tracer {
  constructor() {
    this.events = [];
    this.startedAt = Date.now();
    this.subscribers = new Set();
  }

  /**
   * Live consumers (e.g. an SSE endpoint) can subscribe to receive
   * every event as it's emitted. Returns an unsubscribe function.
   */
  subscribe(fn) {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  emit(kind, payload = {}) {
    const event = {
      t_ms: Date.now() - this.startedAt,
      kind,
      ...payload,
    };
    this.events.push(event);
    for (const fn of this.subscribers) {
      try { fn(event); } catch { /* never let a subscriber kill the run */ }
    }
    return event;
  }

  // ---- Agent-level lifecycle (called from Agent.run) ----
  agentStart(agent, prompt) {
    return this.emit("agent_start", { agent, prompt_summary: trim(prompt, 200) });
  }
  iterStart(agent, iter) {
    return this.emit("iter_start", { agent, iter });
  }
  iterEnd(agent, iter, stop_reason, usage) {
    return this.emit("iter_end", { agent, iter, stop_reason, usage });
  }
  toolCallRequest(agent, iter, tool, input, toolUseId) {
    return this.emit("tool_call_request", {
      agent,
      iter,
      tool,
      tool_use_id: toolUseId,
      input_summary: trim(input, 200),
      input,
    });
  }
  toolCallResult(agent, iter, tool, toolUseId, result, ms) {
    return this.emit("tool_call_result", {
      agent,
      iter,
      tool,
      tool_use_id: toolUseId,
      ms,
      result_summary: trim(result, 200),
    });
  }
  agentEnd(agent, finalText) {
    return this.emit("agent_end", { agent, final_summary: trim(finalText, 200) });
  }

  // ---- Coordinator-level events (called from the capstone) ----
  subagentSpawn(parent, subagent_type, prompt) {
    return this.emit("subagent_spawn", {
      parent,
      subagent_type,
      prompt_summary: trim(prompt, 200),
    });
  }
  subagentReturn(parent, subagent_type, output, ms) {
    return this.emit("subagent_return", {
      parent,
      subagent_type,
      ms,
      output_summary: trim(output, 200),
    });
  }

  // ---- Writers ----
  writeJSON(filePath) {
    fs.writeFileSync(filePath, JSON.stringify(this.events, null, 2));
  }

  /**
   * Render a Mermaid sequence diagram from the event stream.
   * The diagram shows:
   *  - User -> Coordinator at the very start.
   *  - Coordinator ->> Subagent on subagent_spawn.
   *  - Subagent -->> Coordinator on subagent_return.
   *  - Agent activations bracket each agent's run.
   * Tool calls are summarized as a Note over the calling agent rather
   * than as participants (otherwise the diagram explodes).
   */
  writeMermaid(filePath) {
    const lines = ["```mermaid", "sequenceDiagram"];
    const participants = new Set();
    participants.add("User");

    // Collect participants
    for (const e of this.events) {
      if (e.agent) participants.add(e.agent);
      if (e.parent) participants.add(e.parent);
      if (e.subagent_type) participants.add(e.subagent_type);
    }
    for (const p of participants) {
      lines.push(`  participant ${mermaidId(p)} as ${p}`);
    }

    // The first agent to receive a prompt is the user entry point.
    const firstStart = this.events.find((e) => e.kind === "agent_start");
    if (firstStart) {
      lines.push(
        `  User->>${mermaidId(firstStart.agent)}: ${escapeMermaid(firstStart.prompt_summary)}`,
      );
    }

    for (const e of this.events) {
      if (e.kind === "subagent_spawn") {
        lines.push(
          `  ${mermaidId(e.parent)}->>${mermaidId(e.subagent_type)}: Task: ${escapeMermaid(e.prompt_summary)}`,
        );
      }
      if (e.kind === "subagent_return") {
        lines.push(
          `  ${mermaidId(e.subagent_type)}-->>${mermaidId(e.parent)}: result (${e.ms}ms): ${escapeMermaid(e.output_summary)}`,
        );
      }
      if (e.kind === "tool_call_request") {
        lines.push(
          `  Note over ${mermaidId(e.agent)}: 🔧 ${escapeMermaid(e.tool)}(${escapeMermaid(e.input_summary)})`,
        );
      }
      if (e.kind === "iter_end" && e.stop_reason && e.stop_reason !== "tool_use" && e.stop_reason !== "end_turn") {
        lines.push(
          `  Note over ${mermaidId(e.agent)}: ⚠ stop_reason=${e.stop_reason}`,
        );
      }
    }

    if (firstStart) {
      const finalEnd = [...this.events].reverse().find(
        (e) => e.kind === "agent_end" && e.agent === firstStart.agent,
      );
      if (finalEnd) {
        lines.push(
          `  ${mermaidId(firstStart.agent)}-->>User: ${escapeMermaid(finalEnd.final_summary)}`,
        );
      }
    }

    lines.push("```");
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
  }

  /**
   * Print a human-friendly ASCII tree of who called what, ordered by
   * time. Indented by depth. Includes durations.
   */
  printSummary() {
    console.log("\n=========== AGENT FLOW SUMMARY ===========");
    // Track open subagent stacks to indent nested events.
    const stack = []; // [{ subagent_type, parent, startedAt }]
    for (const e of this.events) {
      const depth = stack.length;
      const pad = "  ".repeat(depth);
      if (e.kind === "subagent_spawn") {
        console.log(
          `${pad}[+${e.t_ms.toString().padStart(5)}ms] ${e.parent} ── Task ──▶ ${e.subagent_type}`,
        );
        console.log(`${pad}         prompt: ${e.prompt_summary}`);
        stack.push({ subagent_type: e.subagent_type, parent: e.parent });
      } else if (e.kind === "subagent_return") {
        const top = stack[stack.length - 1];
        if (top && top.subagent_type === e.subagent_type) stack.pop();
        const popPad = "  ".repeat(stack.length);
        console.log(
          `${popPad}[+${e.t_ms.toString().padStart(5)}ms] ${e.subagent_type} ◀── returns ── ${e.parent}  (${e.ms}ms)`,
        );
        console.log(`${popPad}         output: ${e.output_summary}`);
      } else if (e.kind === "iter_end") {
        const mark =
          e.stop_reason === "end_turn" ? "✓" :
          e.stop_reason === "tool_use" ? "→" : "⚠";
        console.log(
          `${pad}     [${e.agent}] iter ${e.iter}  ${mark} ${e.stop_reason}`,
        );
      } else if (e.kind === "tool_call_request") {
        console.log(
          `${pad}     [${e.agent}] 🔧 ${e.tool}(${e.input_summary})`,
        );
      } else if (e.kind === "tool_call_result") {
        console.log(
          `${pad}     [${e.agent}] ↩ ${e.tool} → ${e.result_summary}  (${e.ms}ms)`,
        );
      }
    }
    console.log("===========================================");
  }
}

function escapeMermaid(s) {
  // Mermaid sequence diagrams break on certain characters in labels.
  // Be conservative: strip backticks, collapse newlines, escape colons.
  return (s ?? "")
    .replace(/`/g, "'")
    .replace(/:/g, "·")
    .replace(/\n/g, " ");
}
