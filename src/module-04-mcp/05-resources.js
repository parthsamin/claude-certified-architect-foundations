// ===================================================================
// Module 4 · Concept 4.5 — MCP Resources
// ===================================================================
// MCP has THREE primitives. So far you've used the first (tools). The
// SECOND is RESOURCES — read-only DATA the agent can fetch for CONTEXT
// without taking an action.
//
//   TOOLS      = VERBS (actions: get_order_details, process_refund)
//   RESOURCES  = NOUNS (data:    orders://catalog, schema://orders)
//
// Why resources exist: without them, an agent that needs an OVERVIEW
// of available data must make EXPLORATORY tool calls — "list_orders",
// "list_customers", "list_tables" — each round-tripping through the
// model. With resources, you fetch the "map" ONCE at startup and load
// it into the agent's context. Zero tool calls needed to know what
// exists.
//
// Common resource shapes (from the official guide):
//   - Content catalogs        (list of orders, tasks, articles)
//   - Database schemas        (field types, relationships)
//   - Documentation           (API refs, internal guides)
//   - Issue / task summaries  (open bugs, sprint board)
//
// Read once at agent startup -> embed into the system prompt. The
// agent now knows "what data exists" before its first turn.
//
// THE EXAM TEST: when should X be a tool vs a resource?
//   - The agent needs to TAKE ACTION on a specific item? -> tool.
//   - The agent needs to READ STATIC/STRUCTURAL CONTEXT? -> resource.
//   - "Get the order count" is a tool (live count, computed).
//   - "The orders schema" is a resource (static structure).
//
// Run me with:  npm run m4:resources
// ===================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Agent } from "../module-03-agent-sdk/agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "server-catalog.js")],
  });
  const client = new Client(
    { name: "resources-demo", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);

  // -----------------------------------------------------------------
  // 1. LIST resources. Same discovery pattern as tools.
  // -----------------------------------------------------------------
  const { resources } = await client.listResources();
  console.log(`\nServer publishes ${resources.length} resource(s):`);
  for (const r of resources) {
    console.log(`  - ${r.uri}  (${r.mimeType})`);
    console.log(`      ${r.name}: ${r.description.slice(0, 70)}...`);
  }

  // -----------------------------------------------------------------
  // 2. READ a resource. Returns { contents: [{ uri, mimeType, text }] }.
  //    The agent host typically reads once at startup and embeds the
  //    text into the system prompt as a "data map".
  // -----------------------------------------------------------------
  const catalogRes = await client.readResource({ uri: "orders://catalog" });
  const catalogText = catalogRes.contents[0].text;
  console.log("\n--- orders://catalog content ---");
  console.log(catalogText);

  // -----------------------------------------------------------------
  // 3. AGENT WITH RESOURCE-IN-CONTEXT.
  //    We pre-load the catalog into the system prompt. The agent can
  //    now answer "how many orders does Jane have?" with ZERO tool
  //    calls — it has the map in its head. It will still need a TOOL
  //    to fetch one order's *details* (the catalog is slim).
  // -----------------------------------------------------------------
  const { tools } = await client.listTools();
  const toolCatalog = Object.fromEntries(
    tools.map((t) => [
      t.name,
      {
        schema: { name: t.name, description: t.description, input_schema: t.inputSchema },
        handler: async (input) => {
          const r = await client.callTool({ name: t.name, arguments: input });
          const text = r.content.map((b) => b.text).join("\n");
          if (r.isError) return { isError: true, text };
          try { return JSON.parse(text); } catch { return { text }; }
        },
      },
    ]),
  );

  const agent = new Agent({
    name: "support_with_map",
    description: "Agent that knows the orders catalog up front.",
    systemPrompt:
      "You are a support assistant. The following ORDERS CATALOG is " +
      "always available to you — refer to it for any question about " +
      "what orders exist or which customer they belong to. Only call " +
      "get_order_details when you need the full data for ONE specific " +
      "order.\n\n=== ORDERS CATALOG ===\n" + catalogText,
    allowedTools: Object.keys(toolCatalog),
    toolCatalog,
  });

  console.log("\n### Q1: question answerable from the resource alone ###");
  console.log(await agent.run("Which orders belong to Jane Doe, and what are their statuses?"));

  console.log("\n### Q2: needs a tool (full details for one order) ###");
  console.log(await agent.run("What is the total amount for ORD-1003?"));

  await client.close();
  console.log(
    "\nNotice: Q1 was answered with ZERO tool calls — the catalog in the " +
    "system prompt was enough. Q2 needed the tool because per-order " +
    "details aren't in the resource.",
  );
}

main().catch((err) => {
  console.error("Run failed:", err);
  process.exit(1);
});
