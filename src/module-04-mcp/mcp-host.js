// ===================================================================
// mcp-host.js — bridge MCP servers into the Module-3 Agent class.
// ===================================================================
// The Agent class (../module-03-agent-sdk/agent.js) is configured with
// a `toolCatalog` of the shape:
//
//   { name: { schema: <Anthropic input_schema>, handler: (input)=>result } }
//
// An MCP server publishes tools with a slightly different shape:
//
//   { name, description, inputSchema }          // camelCase, no handler
//
// This module CONNECTS to every server in mcp-config.json, then
// TRANSLATES each MCP tool into a catalog entry the Agent understands:
//   - schema = the Anthropic `input_schema` shape
//             (rename inputSchema -> input_schema)
//   - handler = a closure that calls back into the MCP client over
//             the protocol channel and returns the result text
//
// Net effect: from the Agent's perspective, MCP tools and native tools
// are indistinguishable. The agent doesn't know — or need to know —
// that some of its tools live in another process.
// ===================================================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";

function interpolateEnv(envBlock) {
  if (!envBlock) return {};
  const out = {};
  for (const [k, v] of Object.entries(envBlock)) {
    const m = /^\$\{(\w+)\}$/.exec(v);
    if (m) {
      const val = process.env[m[1]];
      if (!val) return null;
      out[k] = val;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export class MCPHost {
  constructor(configPath) {
    this.configPath = configPath;
    this.clients = []; // [{ name, client }]
    this.toolCatalog = {}; // name -> { schema, handler }
  }

  async connect() {
    const config = JSON.parse(fs.readFileSync(this.configPath, "utf8"));

    for (const [serverName, entry] of Object.entries(config.mcpServers)) {
      const env = interpolateEnv(entry.env);
      if (env === null) continue;          // missing secret -> skip

      const transport = new StdioClientTransport({
        command: entry.command,
        args: entry.args,
        env: { ...process.env, ...env },
      });
      const client = new Client(
        { name: "architect-lab-host", version: "0.1.0" },
        { capabilities: {} },
      );
      try {
        await client.connect(transport);
      } catch {
        continue;
      }

      const { tools } = await client.listTools();
      for (const t of tools) {
        // Translate MCP tool definition -> Anthropic-tools shape.
        const schema = {
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,        // <-- key rename
        };
        // The handler closes over `client` and `t.name`. It calls the
        // tool over the MCP channel and extracts the text payload.
        const handler = async (input) => {
          const res = await client.callTool({
            name: t.name,
            arguments: input,
          });
          // Concept 4.4 preview: surface isError to the caller.
          const text = res.content
            .filter((b) => b.type === "text")
            .map((b) => b.text)
            .join("\n");
          if (res.isError) return { isError: true, text };
          // Try to JSON-parse so the agent sees structured data.
          try {
            return JSON.parse(text);
          } catch {
            return { text };
          }
        };
        this.toolCatalog[t.name] = { schema, handler };
      }
      this.clients.push({ name: serverName, client });
      console.error(`[MCPHost] connected ${serverName} (${tools.length} tool(s))`);
    }
  }

  async close() {
    for (const { client } of this.clients) await client.close();
  }
}
