import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { parseRef } from "../ref-parser.js";
import {
  getDocOutlineInputSchema,
  getDocOutlineOutputSchema,
} from "../schemas/get-doc-outline.js";
import type { Runtime } from "../services/runtime.js";
import {
  createJsonToolResult,
  createToolErrorResult,
  readOnlyToolAnnotations,
} from "./shared.js";

export function registerGetDocOutlineTool(
  server: McpServer,
  getRuntime: () => Promise<Runtime>,
): void {
  server.registerTool(
    "get_doc_outline",
    {
      title: "Get ONES Document Outline",
      description: "Return section outline and size metadata for a ONES doc ref.",
      inputSchema: getDocOutlineInputSchema,
      outputSchema: getDocOutlineOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref }) => {
      try {
        const { cfg, client } = await getRuntime();
        const parsedRef = parseRef(ref, new URL(cfg.baseUrl).host);
        const outline = await client.getDocOutlineByParsedRef(parsedRef);
        return createJsonToolResult(outline);
      } catch (error) {
        return createToolErrorResult("get_doc_outline", error);
      }
    },
  );
}
