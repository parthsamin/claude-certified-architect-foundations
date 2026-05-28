// ===================================================================
// Module 4 · Concept 4.2 — Configuring MCP Servers
// ===================================================================
// MCP servers are declared in CONFIG FILES, not hard-coded. Two
// locations the exam wants you to know:
//
//   .mcp.json  (project root, version-controlled)
//      For TEAM-shared servers. Anyone who checks out the repo gets
//      the same set. Secrets are NEVER hard-coded — they go in env
//      vars, referenced as "${TOKEN_NAME}" inside the `env` block.
//      Format example:
//
//        {
//          "mcpServers": {
//            "github": {
//              "command": "npx",
//              "args": ["-y", "@modelcontextprotocol/server-github"],
//              "env": { "GITHUB_TOKEN": "${GITHUB_TOKEN}" }
//            },
//            "jira": { ... }
//          }
//        }
//
//   ~/.claude.json  (user home, NOT version-controlled)
//      For PERSONAL / experimental servers. Not shared with the team.
//      Use when you're trying something out, or for personal tokens
//      that shouldn't be in any shared config.
//
// THE GOLDEN RULES the exam tests:
//   - Project-shared servers -> .mcp.json (committed, env-var secrets)
//   - Personal/experimental  -> ~/.claude.json (NOT committed)
//   - For standard SaaS (GitHub, Jira, Slack)  -> use EXISTING community servers
//   - For unique, internal workflows           -> build your own
//
// This file READS a .mcp.json-style config and connects to every
// configured server, interpolating ${ENV_VARS} from process.env. It
// then prints the union of all discovered tools — that is the
// effective `tools` array an agent host would assemble.
//
// Run me with:  npm run m4:config
// ===================================================================

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.join(__dirname, "mcp-config.json");

// -------------------------------------------------------------------
// Interpolate ${VAR_NAME} inside the env block, reading from
// process.env. If any referenced var is missing, return null to
// signal "skip this server" — DO NOT silently substitute empty.
// -------------------------------------------------------------------
function interpolateEnv(envBlock) {
  if (!envBlock) return {};
  const out = {};
  for (const [k, v] of Object.entries(envBlock)) {
    const match = /^\$\{(\w+)\}$/.exec(v);
    if (match) {
      const value = process.env[match[1]];
      if (!value) return null;
      out[k] = value;
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function connectToAllConfiguredServers() {
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const allTools = []; // { server, name, description }
  const connections = [];

  for (const [serverName, entry] of Object.entries(config.mcpServers)) {
    const env = interpolateEnv(entry.env);
    if (env === null) {
      console.log(`[skip]   ${serverName} — required env var not set`);
      continue;
    }

    console.log(`[start]  ${serverName} -> ${entry.command} ${entry.args.join(" ")}`);
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
    } catch (err) {
      console.log(`[fail]   ${serverName} — ${err.message}`);
      continue;
    }

    const { tools } = await client.listTools();
    for (const t of tools) {
      allTools.push({ server: serverName, name: t.name, description: t.description });
    }
    console.log(`[ok]     ${serverName} published ${tools.length} tool(s)`);
    connections.push(client);
  }

  return { allTools, connections };
}

async function main() {
  console.log(`Reading ${path.relative(process.cwd(), CONFIG_PATH)}\n`);
  const { allTools, connections } = await connectToAllConfiguredServers();

  console.log("\n--- Effective tool set (union across all servers) ---");
  for (const t of allTools) {
    console.log(`  [${t.server}] ${t.name} — ${t.description.slice(0, 60)}...`);
  }
  console.log(
    `\nThat ${allTools.length}-tool list is what the agent host would expose to Claude.`,
  );
  console.log("Add a server, the agent gains its tools automatically — no agent code changed.");

  for (const c of connections) await c.close();
}

main().catch((err) => {
  console.error("Config loader failed:", err);
  process.exit(1);
});
