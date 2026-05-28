// ===================================================================
// Module 4 · MCP Server (used by Concept 4.1 client)
// ===================================================================
// A minimal Model Context Protocol server in Node.js. It exposes ONE
// TOOL (`get_order_status`) over the stdio transport.
//
// This file is the SERVER side of MCP. It does not run on its own;
// the CLIENT (01-mcp-client.js) launches it as a subprocess and
// speaks the MCP protocol over stdin/stdout.
//
// What you'll learn from this file:
//   - An MCP server is just a process implementing the protocol.
//   - It declares CAPABILITIES (here: tools) and registers HANDLERS
//     for protocol messages (ListTools, CallTool).
//   - Tools are discovered by clients automatically — you do not
//     hand-wire tool names into the agent.
// ===================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// -------------------------------------------------------------------
// Mock backend data — pretend this is a real orders database/API.
// -------------------------------------------------------------------
const ORDERS = {
  "ORD-1001": { status: "in transit", carrier: "DHL", eta: "2026-05-27" },
  "ORD-1002": { status: "delivered", carrier: "UPS", eta: "2026-05-20" },
};

// -------------------------------------------------------------------
// Create the MCP server. The "capabilities" object tells the client
// which protocol primitives this server provides. We're declaring
// only `tools` here; later concepts will add `resources`.
// -------------------------------------------------------------------
const server = new Server(
  { name: "orders-demo", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

// -------------------------------------------------------------------
// Handler 1: ListTools — discovery.
// When a client first connects, it calls listTools() to find out
// what this server can do. Whatever we return here is what the agent
// sees in its `tools` array. NOTE: `inputSchema`, camelCase (MCP
// convention), NOT `input_schema` (the Anthropic API convention).
// -------------------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_order_status",
      description:
        "Look up a customer order by ID. Returns shipping status, carrier, " +
        "and estimated delivery date. Use for any 'where is my order' query.",
      inputSchema: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "The order ID, e.g. ORD-1001" },
        },
        required: ["order_id"],
      },
    },
  ],
}));

// -------------------------------------------------------------------
// Handler 2: CallTool — execution.
// MCP tool RESPONSES are { content: [...] } where each content block
// has { type: "text", text: "..." } — NOT the raw object. The agent
// reads this string. JSON-stringify structured data for the agent.
// -------------------------------------------------------------------
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "get_order_status") {
    const record = ORDERS[args.order_id];
    if (!record) {
      // PREVIEW of Concept 4.4 (isError). A structured error tells
      // the agent what went wrong and whether to retry / change query.
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({
          errorCategory: "not_found",
          isRetryable: false,
          message: `No order with id '${args.order_id}'.`,
        }) }],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(record) }],
    };
  }

  return {
    isError: true,
    content: [{ type: "text", text: `unknown tool: ${name}` }],
  };
});

// -------------------------------------------------------------------
// Run the server over stdio. The client (a parent process) talks to
// us via our stdin/stdout. console.error goes to stderr so it's
// visible without corrupting the protocol stream on stdout.
// -------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[orders-demo MCP server] connected over stdio");
