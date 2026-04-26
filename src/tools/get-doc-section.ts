import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { parseRef } from "../ref-parser.js";
import {
  getDocSectionInputSchema,
  getDocSectionOutputSchema,
} from "../schemas/get-doc-section.js";
import type { Runtime } from "../services/runtime.js";
import {
  createJsonToolResult,
  createToolErrorResult,
  readOnlyToolAnnotations,
} from "./shared.js";

export function registerGetDocSectionTool(
  server: McpServer,
  getRuntime: () => Promise<Runtime>,
): void {
  server.registerTool(
    "get_doc_section",
    {
      title: "Get ONES Document Section",
      description: "Return one outline section from a ONES doc ref, optionally including descendants.",
      inputSchema: getDocSectionInputSchema,
      outputSchema: getDocSectionOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref, section_id, include_descendants, include_resources }) => {
      try {
        const { cfg, client } = await getRuntime();
        const parsedRef = parseRef(ref, new URL(cfg.baseUrl).host);
        const section = await client.getDocSectionByParsedRef(parsedRef, section_id, {
          includeDescendants: include_descendants,
          includeResources: include_resources,
        });
        return createJsonToolResult(section);
      } catch (error) {
        return createToolErrorResult("get_doc_section", error);
      }
    },
  );
}
