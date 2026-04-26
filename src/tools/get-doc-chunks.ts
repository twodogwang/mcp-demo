import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { parseRef } from "../ref-parser.js";
import {
  getDocChunksInputSchema,
  getDocChunksOutputSchema,
} from "../schemas/get-doc-chunks.js";
import type { Runtime } from "../services/runtime.js";
import {
  createJsonToolResult,
  createToolErrorResult,
  readOnlyToolAnnotations,
} from "./shared.js";

export function registerGetDocChunksTool(
  server: McpServer,
  getRuntime: () => Promise<Runtime>,
): void {
  server.registerTool(
    "get_doc_chunks",
    {
      title: "Get ONES Document Chunks",
      description: "Return one cursor-based chunk from a ONES doc ref using a character budget.",
      inputSchema: getDocChunksInputSchema,
      outputSchema: getDocChunksOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref, cursor, max_chars, include_resources }) => {
      try {
        const { cfg, client } = await getRuntime();
        const parsedRef = parseRef(ref, new URL(cfg.baseUrl).host);
        const chunk = await client.getDocChunksByParsedRef(parsedRef, {
          cursor,
          maxChars: max_chars,
          includeResources: include_resources,
        });
        return createJsonToolResult(chunk);
      } catch (error) {
        return createToolErrorResult("get_doc_chunks", error);
      }
    },
  );
}
