#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { SessionManager } from "./auth/session-manager.js";
import { loadConfig } from "./config.js";
import { EndpointDiscovery } from "./discovery/endpoint-discovery.js";
import { OnesClient } from "./ones-client.js";
import { parseRef } from "./ref-parser.js";

export function buildToolList(): Tool[] {
  return [
    {
      name: "search_docs",
      description: "Search ONES docs by keyword",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number", minimum: 1, maximum: 20, default: 5 },
        },
        required: ["query"],
      },
    },
    {
      name: "get_doc",
      description: "Get ONES doc by context ref (URL or #requirement)",
      inputSchema: {
        type: "object",
        properties: {
          ref: { type: "string" },
        },
        required: ["ref"],
      },
    },
  ];
}

export function createServer() {
  const cfg = loadConfig();
  const discovery = new EndpointDiscovery(cfg.baseUrl, cfg.timeoutMs);

  const sessions = new SessionManager({
    baseUrl: cfg.baseUrl,
    username: cfg.username,
    password: cfg.password,
    discovery,
  });

  const client = new OnesClient(
    {
      baseUrl: cfg.baseUrl,
      timeoutMs: cfg.timeoutMs,
      maxContentChars: cfg.maxContentChars,
    },
    sessions,
    discovery,
  );

  const server = new Server(
    {
      name: "ones-doc-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: buildToolList(),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "search_docs") {
      const input = z
        .object({
          query: z.string().min(1),
          limit: z.number().int().min(1).max(20).default(5),
        })
        .parse(request.params.arguments ?? {});

      const items = await client.searchDocs(input.query, input.limit);
      return {
        content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      };
    }

    if (request.params.name === "get_doc") {
      const input = z
        .object({
          ref: z.string().min(1),
        })
        .parse(request.params.arguments ?? {});

      const parsed = parseRef(input.ref, new URL(cfg.baseUrl).host);
      const doc =
        parsed.kind === "doc"
          ? await client.getDoc(parsed.docId)
          : await client.getDocByRequirementId(parsed.requirementId);

      return {
        content: [{ type: "text", text: JSON.stringify(doc, null, 2) }],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}

export async function startStdioServer(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startStdioServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
