import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createRuntimeLoader } from "../services/runtime.js";
import { registerGetDocChunksTool } from "../tools/get-doc-chunks.js";
import { registerGetDocContextTool } from "../tools/get-doc-context.js";
import { registerGetDocTool } from "../tools/get-doc.js";
import { registerGetDocOutlineTool } from "../tools/get-doc-outline.js";
import { registerGetDocSectionTool } from "../tools/get-doc-section.js";
import { registerSearchDocsTool } from "../tools/search-docs.js";

export type CreateMcpServerOptions = {
  getRuntime?: ReturnType<typeof createRuntimeLoader>;
};

export function createMcpServer(options: CreateMcpServerOptions = {}) {
  const getRuntime = options.getRuntime ?? createRuntimeLoader();

  const server = new McpServer({
    name: "ones-doc-mcp",
    version: "1.1.1",
  });

  registerSearchDocsTool(server, getRuntime);
  registerGetDocTool(server, getRuntime);
  registerGetDocOutlineTool(server, getRuntime);
  registerGetDocSectionTool(server, getRuntime);
  registerGetDocChunksTool(server, getRuntime);
  registerGetDocContextTool(server, getRuntime);

  return server;
}
