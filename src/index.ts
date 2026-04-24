#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

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
import { getRuntimeEnvMeta, logError, logInfo, serializeError } from "./logger.js";
import { OnesClient } from "./ones-client.js";
import { parseRef } from "./ref-parser.js";

type Runtime = {
  cfg: ReturnType<typeof loadConfig>;
  client: OnesClient;
};

function defaultResolvePath(input: string): string {
  return realpathSync(input);
}

export function isCliEntrypoint(
  importMetaUrl: string,
  argv1: string | undefined = process.argv[1],
  resolvePath: (input: string) => string = defaultResolvePath,
): boolean {
  if (!argv1) {
    return false;
  }

  try {
    return resolvePath(fileURLToPath(importMetaUrl)) === resolvePath(argv1);
  } catch {
    return false;
  }
}

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
  let runtime: Runtime | null = null;

  const getRuntime = (): Runtime => {
    if (runtime) {
      return runtime;
    }

    try {
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

      runtime = { cfg, client };
      return runtime;
    } catch (error) {
      logError("mcp.runtime.init.failed", {
        ...getRuntimeEnvMeta(),
        ...serializeError(error),
      });
      throw error;
    }
  };

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
    try {
      if (request.params.name === "search_docs") {
        const { client } = getRuntime();
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
        const { cfg, client } = getRuntime();
        const input = z
          .object({
            ref: z.string().min(1),
          })
          .parse(request.params.arguments ?? {});

        const parsed = parseRef(input.ref, new URL(cfg.baseUrl).host);
        const doc =
          parsed.kind === "doc"
            ? await client.getDoc(parsed.docId)
            : parsed.kind === "page"
              ? await client.getPageDoc(parsed.teamId, parsed.pageId)
              : await client.getDocByRequirementId(parsed.requirementId);

        return {
          content: [{ type: "text", text: JSON.stringify(doc, null, 2) }],
        };
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    } catch (error) {
      logError("mcp.tool.failed", {
        toolName: request.params.name,
        ...serializeError(error),
      });
      throw error;
    }
  });

  return server;
}

export async function startStdioServer(): Promise<void> {
  logInfo("mcp.startup.begin", getRuntimeEnvMeta());
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logInfo("mcp.startup.ready", getRuntimeEnvMeta());
}

if (isCliEntrypoint(import.meta.url)) {
  process.on("uncaughtException", (error) => {
    logError("mcp.process.uncaughtException", {
      ...getRuntimeEnvMeta(),
      ...serializeError(error),
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    logError("mcp.process.unhandledRejection", {
      ...getRuntimeEnvMeta(),
      ...serializeError(reason),
    });
    process.exit(1);
  });

  startStdioServer().catch((err) => {
    logError("mcp.startup.failed", {
      ...getRuntimeEnvMeta(),
      ...serializeError(err),
    });
    process.exit(1);
  });
}
