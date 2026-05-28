// ===================================================================
// Module 4 · Concept 4.3 — Integrating MCP Tools into the Agent
// ===================================================================
// THE BIG MERGE. We take:
//   - the `Agent` class from Module 3 (src/module-03-agent-sdk/agent.js)
//   - the MCP server from Concept 4.1 (src/module-04-mcp/server.js)
//   - the config from Concept 4.2 (mcp-config.json)
// ...and wire them together. The agent uses MCP-discovered tools as
// if they were native handlers. There is no distinction inside the
// agent loop; the architectural seam is at the catalog boundary.
//
// What `mcp-host.js` does:
//   1. Reads mcp-config.json.
//   2. Spawns each configured server and connects via stdio.
//   3. Calls listTools() on each.
//   4. For every tool, builds:
//        schema  -> rename `inputSchema` to `input_schema`
//                   (MCP camelCase -> Anthropic snake_case)
//        handler -> closure that calls back into MCP and unwraps the
//                   { content: [{type:"text", text}] } envelope
//   5. Returns one merged `toolCatalog` ready for the Agent.
//
// Run me with:  npm run m4:agent
// ===================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Agent } from "../module-03-agent-sdk/agent.js";
import { MCPHost } from "./mcp-host.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(__dirname, "mcp-config.json");

async function main() {
  // -----------------------------------------------------------------
  // 1. Spin up MCP — discover every tool every configured server has.
  // -----------------------------------------------------------------
  const host = new MCPHost(CONFIG);
  await host.connect();

  const discovered = Object.keys(host.toolCatalog);
  console.log(`\nDiscovered ${discovered.length} MCP tool(s): ${discovered.join(", ")}\n`);

  // -----------------------------------------------------------------
  // 2. Build an Agent. Its `toolCatalog` is the MCP one. Its
  //    `allowedTools` is the full discovered set — but principle of
  //    least privilege (Concept 3.2) still applies: a tier-1 agent
  //    would whitelist a subset, not the whole list.
  // -----------------------------------------------------------------
  const supportAgent = new Agent({
    name: "support_via_mcp",
    description: "Customer support agent backed by MCP tools.",
    systemPrompt:
      "You are a customer support assistant. Use the available tools to " +
      "look up order data when a customer asks about their order. Never " +
      "guess order details — always check first.",
    allowedTools: discovered,
    toolCatalog: host.toolCatalog,
  });

  // -----------------------------------------------------------------
  // 3. Run it. From the Agent's point of view the loop is identical
  //    to Module 3. The handler happens to call across a process
  //    boundary now, but the loop code didn't change.
  // -----------------------------------------------------------------
  console.log("### Q1: real order ###");
  console.log(await supportAgent.run("Where is my order ORD-1001? When will it arrive?"));

  console.log("\n### Q2: unknown order (MCP returns isError) ###");
  console.log(await supportAgent.run("Status check on order ORD-FAKE-9999 please."));

  await host.close();
  console.log("\nNote: the Agent code is IDENTICAL to Module 3.");
  console.log("Adding more MCP servers in mcp-config.json grows the toolset");
  console.log("with zero changes inside the agent.");
}

main().catch((err) => {
  console.error("Run failed:", err);
  process.exit(1);
});
