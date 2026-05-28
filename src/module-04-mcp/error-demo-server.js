// ===================================================================
// Module 4 · MCP server with two failing tools — for Concept 4.4
// ===================================================================
// Same operation ("query orders"), two error shapes:
//
//   query_orders_structured  -> isError: true + RICH error payload
//                               (category, retryable, message, query)
//   query_orders_generic     -> isError: true + "Operation failed"
//
// We use this to compare what an agent can DO with each shape.
// ===================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "error-demo", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const sharedSchema = {
  type: "object",
  properties: { query: { type: "string", description: "Customer query string" } },
  required: ["query"],
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "query_orders_structured",
      description:
        "Query the orders backend. Always fails for demo purposes; " +
        "returns a STRUCTURED error so the agent can reason about " +
        "whether to retry, change the query, or escalate.",
      inputSchema: sharedSchema,
    },
    {
      name: "query_orders_generic",
      description:
        "Query the orders backend. Always fails for demo purposes; " +
        "returns a GENERIC error message (anti-pattern).",
      inputSchema: sharedSchema,
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "query_orders_structured") {
    // GOOD: every field the agent needs to make a decision.
    return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({
        errorCategory: "transient",          // transient vs permanent
        isRetryable: true,                   // can we try again?
        message: "Upstream orders service timed out after 3000ms.",
        attempted_query: args.query,
        partial_results: null,
        retry_after_seconds: 2,
      }) }],
    };
  }

  if (name === "query_orders_generic") {
    // BAD: no category, no retryability, no context. Anti-pattern.
    return {
      isError: true,
      content: [{ type: "text", text: "Operation failed" }],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `unknown tool: ${name}` }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[error-demo MCP server] connected over stdio");
