// ===================================================================
// Module 4 · Concept 4.1 — What is MCP (and an MCP Server)
// ===================================================================
// MCP = Model Context Protocol. An OPEN protocol for connecting
// external systems to Claude. It defines three primary primitives:
//
//   TOOLS      — functions the agent can CALL to take actions.
//                (CRUD, API calls, command execution.)
//   RESOURCES  — read-only DATA the agent can fetch for context.
//                (docs, schemas, content catalogs.) Concept 4.5.
//   PROMPTS    — predefined prompt templates for common tasks.
//
// An MCP SERVER is a PROCESS that implements the protocol and
// publishes some subset of those primitives. A CLIENT (your agent
// host) connects to one or more servers and AUTOMATICALLY discovers
// the tools they offer — you do not hand-wire tool definitions.
//
// This file is the CLIENT side. It spawns server.js as a subprocess
// over the stdio transport, lists the tools the server publishes,
// and invokes one of them. The exchange you'll see is the full MCP
// lifecycle in miniature: connect -> discover -> call -> result.
//
// One-time setup (the MCP SDK is new this module):
//   cd claude-architect-lab && npm install
//
// Run me with:  npm run m4:mcp
// ===================================================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  // -----------------------------------------------------------------
  // STEP 1 — CONNECT. The client spawns server.js as a subprocess.
  // stdin/stdout become the protocol channel between us and it.
  // -----------------------------------------------------------------
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "server.js")],
  });
  const client = new Client(
    { name: "architect-lab-client", version: "0.1.0" },
    { capabilities: {} },
  );

  await client.connect(transport);
  console.log("Connected to MCP server.\n");

  // -----------------------------------------------------------------
  // STEP 2 — DISCOVERY. The hallmark of MCP: we did NOT hard-code
  // any tool names. We ASK the server what tools it offers.
  // -----------------------------------------------------------------
  const { tools } = await client.listTools();
  console.log(`Server published ${tools.length} tool(s):`);
  for (const t of tools) {
    console.log(`  - ${t.name}: ${t.description.slice(0, 70)}...`);
  }

  // -----------------------------------------------------------------
  // STEP 3 — CALL a tool. Same protocol message shape regardless of
  // which server is on the other side. THAT is the "open protocol"
  // benefit: one client speaks to any MCP server.
  // -----------------------------------------------------------------
  console.log("\nCalling get_order_status(order_id='ORD-1001')...");
  const ok = await client.callTool({
    name: "get_order_status",
    arguments: { order_id: "ORD-1001" },
  });
  console.log("  result:", ok.content[0].text);
  console.log("  isError:", ok.isError ?? false);

  // -----------------------------------------------------------------
  // STEP 4 — Call with a missing ID. The server returns a STRUCTURED
  // ERROR with isError: true. (Full treatment in Concept 4.4.)
  // -----------------------------------------------------------------
  console.log("\nCalling get_order_status(order_id='ORD-DOES-NOT-EXIST')...");
  const bad = await client.callTool({
    name: "get_order_status",
    arguments: { order_id: "ORD-DOES-NOT-EXIST" },
  });
  console.log("  result:", bad.content[0].text);
  console.log("  isError:", bad.isError);

  // -----------------------------------------------------------------
  // STEP 5 — Tear down.
  // -----------------------------------------------------------------
  await client.close();
  console.log("\nClosed. Server subprocess exited.");
}

main().catch((err) => {
  console.error("MCP client failed:", err);
  process.exit(1);
});
