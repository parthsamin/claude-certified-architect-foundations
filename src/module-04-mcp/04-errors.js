// ===================================================================
// Module 4 · Concept 4.4 — The isError Flag and Structured Errors
// ===================================================================
// An MCP tool that hit a failure SHOULD set `isError: true` in its
// response. But the FLAG alone is not enough — the agent needs
// enough INFORMATION inside the error to decide what to do next.
//
// STRUCTURED ERROR (good):
//   {
//     isError: true,
//     content: [{ type: "text", text: JSON.stringify({
//       errorCategory: "transient",      // transient / permanent / validation
//       isRetryable: true,               // can we try again?
//       message: "Upstream orders service timed out after 3000ms.",
//       attempted_query: "ORD-1001",
//       partial_results: null,
//       retry_after_seconds: 2
//     })}]
//   }
//
// GENERIC ERROR (anti-pattern):
//   { isError: true, content: [{type:"text", text:"Operation failed"}] }
//
// The generic error tells the agent: "something broke." That's it.
// With a structured error the agent can:
//   - RETRY when isRetryable: true and errorCategory == "transient"
//   - REWORD the query when errorCategory == "validation"
//   - ESCALATE to a human when isRetryable: false (permanent)
//   - WAIT retry_after_seconds before retrying
//   - PARTIAL-SUCCESS: use partial_results if non-null
//
// This file:
//   1. Calls both tools directly and prints their responses so you
//      can compare what an agent actually receives.
//   2. Runs an agent against EACH tool to compare reasoning behavior.
//
// Run me with:  npm run m4:errors
// ===================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Agent } from "../module-03-agent-sdk/agent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function rawComparison(client) {
  console.log("\n=== RAW MCP RESPONSES (what the agent receives) ===");

  const a = await client.callTool({
    name: "query_orders_structured",
    arguments: { query: "ORD-1001" },
  });
  console.log("\n[structured]");
  console.log("  isError:", a.isError);
  console.log("  content[0].text:", a.content[0].text);

  const b = await client.callTool({
    name: "query_orders_generic",
    arguments: { query: "ORD-1001" },
  });
  console.log("\n[generic]");
  console.log("  isError:", b.isError);
  console.log("  content[0].text:", b.content[0].text);

  console.log(
    "\nNotice the asymmetry: the structured error tells the agent " +
    "WHAT broke, WHETHER to retry, and HOW long to wait. The generic " +
    "error tells it nothing.",
  );
}

// Build a one-tool catalog from an MCP client + tool name (mirrors mcp-host.js).
async function makeCatalog(client, toolName) {
  const { tools } = await client.listTools();
  const t = tools.find((x) => x.name === toolName);
  return {
    [toolName]: {
      schema: { name: t.name, description: t.description, input_schema: t.inputSchema },
      handler: async (input) => {
        const res = await client.callTool({ name: toolName, arguments: input });
        const text = res.content.map((b) => b.text).join("\n");
        if (res.isError) return { isError: true, text };
        try { return JSON.parse(text); } catch { return { text }; }
      },
    },
  };
}

async function agentComparison(client) {
  console.log("\n=== AGENT REASONING UNDER EACH ERROR SHAPE ===");

  for (const toolName of ["query_orders_structured", "query_orders_generic"]) {
    const catalog = await makeCatalog(client, toolName);
    const agent = new Agent({
      name: `agent_${toolName}`,
      description: "Support agent for the comparison demo.",
      systemPrompt:
        "You are a support assistant. Use the tool to look up the customer's order. " +
        "If the tool returns an error, decide what to do next based on what the error tells you. " +
        "Tell the user clearly what happened, whether you can retry, and what they should do.",
      allowedTools: Object.keys(catalog),
      toolCatalog: catalog,
      maxIterations: 4, // keep retries bounded for the demo
    });
    console.log(`\n--- ${toolName} ---`);
    const out = await agent.run("Please check on my order ORD-1001.");
    console.log(out);
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: "node",
    args: [path.join(__dirname, "error-demo-server.js")],
  });
  const client = new Client(
    { name: "errors-demo-client", version: "0.1.0" },
    { capabilities: {} },
  );
  await client.connect(transport);

  await rawComparison(client);
  await agentComparison(client);

  await client.close();
}

main().catch((err) => {
  console.error("Run failed:", err);
  process.exit(1);
});
