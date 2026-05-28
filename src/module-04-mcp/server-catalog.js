// ===================================================================
// Module 4 · MCP server that publishes RESOURCES (for Concept 4.5)
// ===================================================================
// Demonstrates the second MCP primitive: RESOURCES. The server
// publishes:
//   - one TOOL  (verb / action: get_order_details)
//   - two RESOURCES (nouns / data: orders catalog, orders schema)
//
// Resources are READ-ONLY context. The agent reads them to BUILD A
// MAP of what data exists, then uses tools to act on specific items.
// ===================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const ORDERS = {
  "ORD-1001": { id: "ORD-1001", customer: "Jane Doe",  status: "in transit", carrier: "DHL", eta: "2026-05-27", total: 199.0 },
  "ORD-1002": { id: "ORD-1002", customer: "Jane Doe",  status: "delivered",  carrier: "UPS", eta: "2026-05-20", total: 79.99 },
  "ORD-1003": { id: "ORD-1003", customer: "Sam Patel", status: "processing", carrier: null,  eta: "2026-06-02", total: 459.0 },
};

const ORDERS_SCHEMA = {
  name: "orders",
  description: "Each row represents a customer order.",
  fields: {
    id:       { type: "string",  pk: true,  example: "ORD-1001" },
    customer: { type: "string",  example: "Jane Doe" },
    status:   { type: "enum",    values: ["processing", "in transit", "delivered", "cancelled"] },
    carrier:  { type: "string?", example: "DHL" },
    eta:      { type: "date",    example: "2026-05-27" },
    total:    { type: "number",  example: 199.0 },
  },
};

const server = new Server(
  { name: "orders-with-catalog", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {} } }, // <-- declare BOTH
);

// ---- TOOLS ----------------------------------------------------------
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_order_details",
      description: "Fetch the full details of one order by id.",
      inputSchema: {
        type: "object",
        properties: { order_id: { type: "string" } },
        required: ["order_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (name === "get_order_details") {
    const o = ORDERS[args.order_id];
    if (!o) return {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({
        errorCategory: "not_found", isRetryable: false,
        message: `No order with id ${args.order_id}`,
      }) }],
    };
    return { content: [{ type: "text", text: JSON.stringify(o) }] };
  }
  return { isError: true, content: [{ type: "text", text: `unknown tool: ${name}` }] };
});

// ---- RESOURCES ------------------------------------------------------
// Each resource has a URI (the key the client uses to read it),
// a human-readable name and description, and a mimeType so the
// client knows how to render it.
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "orders://catalog",
      name: "Orders catalog",
      description:
        "A complete list of all orders with id, customer, and status. " +
        "Read this first to get an OVERVIEW of available orders — saves " +
        "the agent from exploratory tool calls.",
      mimeType: "application/json",
    },
    {
      uri: "schema://orders",
      name: "Orders schema",
      description:
        "Field definitions and types for the orders table. Read this " +
        "to understand the data model before constructing queries.",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri } = req.params;
  if (uri === "orders://catalog") {
    // Return a slim catalog — id/customer/status — not the full rows.
    // Tools fetch the full row when you act on a specific item.
    const catalog = Object.values(ORDERS).map(({ id, customer, status }) => ({
      id,
      customer,
      status,
    }));
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(catalog, null, 2) }],
    };
  }
  if (uri === "schema://orders") {
    return {
      contents: [{ uri, mimeType: "application/json", text: JSON.stringify(ORDERS_SCHEMA, null, 2) }],
    };
  }
  throw new Error(`unknown resource: ${uri}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[orders-with-catalog MCP server] connected over stdio");
