// ===================================================================
// Capstone · MCP server — knowledge base for the research network
// ===================================================================
// Publishes:
//   TOOL     search_knowledge_base(topic) -> documents with provenance
//   RESOURCE kb://catalog                 -> a map of all topics
//
// Every document carries source_name, source_url, publication_date,
// methodology, value/claim. The researcher subagents read this MCP
// server and return claims WITH attribution preserved (Module 12).
//
// Note: "music" deliberately has two conflicting numbers from
// different dates — this exercises the provenance/conflict pattern.
// ===================================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const DOCS = [
  {
    id: "art-2024-adobe",
    topic: "visual_art",
    claim: "Approximately 28% of professional illustrators have adopted at least one AI-assisted tool in their workflow.",
    source_name: "Adobe Creative Trends Survey",
    source_url: "https://example.com/adobe-2024",
    publication_date: "2024-08",
    methodology: "Survey of 3,400 working illustrators",
    confidence: 0.85,
  },
  {
    id: "art-2025-pen",
    topic: "visual_art",
    claim: "Gallery curators report mixed responses to AI-generated work; 42% of surveyed galleries have an explicit policy on AI-art disclosure.",
    source_name: "PEN America Visual Arts Report",
    source_url: "https://example.org/pen-2025-art",
    publication_date: "2025-02",
    methodology: "Survey of 180 galleries plus interviews",
    confidence: 0.8,
  },
  {
    id: "music-2024-spotify",
    topic: "music",
    claim: "About 12% of newly uploaded tracks include AI-generated stems.",
    source_name: "Spotify Annual Report",
    source_url: "https://example.com/spotify-2024",
    publication_date: "2024-03",
    methodology: "Automated audio classification of new uploads",
    confidence: 0.9,
  },
  {
    id: "music-2023-mia",
    topic: "music",
    claim: "Approximately 8% of major-label releases involved AI-generated audio in some capacity.",
    source_name: "Music Industry Association Survey",
    source_url: "https://example.org/mia-2023",
    publication_date: "2023-09",
    methodology: "Survey of 500 record labels",
    confidence: 0.7,
  },
  {
    id: "lit-2025-pen",
    topic: "literature",
    claim: "Three of the five largest publishers piloted AI-assisted translation in 2025; reception ranges from cautiously positive to critical.",
    source_name: "PEN America Translators' Survey",
    source_url: "https://example.org/pen-2025-lit",
    publication_date: "2025-01",
    methodology: "Survey of publisher representatives and 600 working translators",
    confidence: 0.85,
  },
  {
    id: "lit-2024-translators",
    topic: "literature",
    claim: "The Authors Guild reports a 14% decline in routine translation contracts attributed to AI substitution.",
    source_name: "Authors Guild Annual Report",
    source_url: "https://example.org/ag-2024",
    publication_date: "2024-11",
    methodology: "Member self-report",
    confidence: 0.7,
  },
];

const server = new Server(
  { name: "creative-industries-kb", version: "0.1.0" },
  { capabilities: { tools: {}, resources: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_knowledge_base",
      description:
        "Search the creative-industries knowledge base by topic. " +
        "Returns up to 5 documents matching the topic, each with full " +
        "provenance: claim, source_name, source_url, publication_date, " +
        "methodology, and a confidence score. Topic must be one of: " +
        "visual_art, music, literature.",
      inputSchema: {
        type: "object",
        properties: {
          topic: { type: "string", enum: ["visual_art", "music", "literature"] },
        },
        required: ["topic"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  if (name === "search_knowledge_base") {
    const hits = DOCS.filter((d) => d.topic === args.topic);
    if (hits.length === 0) {
      return {
        isError: true,
        content: [{ type: "text", text: JSON.stringify({
          errorCategory: "not_found",
          isRetryable: false,
          message: `No documents for topic '${args.topic}'.`,
        }) }],
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(hits) }],
    };
  }
  return {
    isError: true,
    content: [{ type: "text", text: `unknown tool: ${name}` }],
  };
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: "kb://catalog",
      name: "KB topic catalog",
      description: "Map of available topics to the number of documents. Read at startup to know what topics exist.",
      mimeType: "application/json",
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  if (req.params.uri === "kb://catalog") {
    const catalog = {};
    for (const d of DOCS) {
      catalog[d.topic] = (catalog[d.topic] || 0) + 1;
    }
    return {
      contents: [{
        uri: req.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(catalog, null, 2),
      }],
    };
  }
  throw new Error(`unknown resource: ${req.params.uri}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[creative-industries-kb] connected over stdio");
