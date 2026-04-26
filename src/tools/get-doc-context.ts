import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { parseRef } from "../ref-parser.js";
import {
  getDocContextInputSchema,
  getDocContextOutputSchema,
} from "../schemas/get-doc-context.js";
import type { Runtime } from "../services/runtime.js";
import {
  createJsonToolResult,
  createToolErrorResult,
  readOnlyToolAnnotations,
} from "./shared.js";

export function registerGetDocContextTool(
  server: McpServer,
  getRuntime: () => Promise<Runtime>,
): void {
  server.registerTool(
    "get_doc_context",
    {
      title: "Get ONES Document Context",
      description: "Automatically select sections or chunks for a ONES doc ref based on a question.",
      inputSchema: getDocContextInputSchema,
      outputSchema: getDocContextOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ ref, question, max_chars, include_resources }) => {
      try {
        const { cfg, client } = await getRuntime();
        const parsedRef = parseRef(ref, new URL(cfg.baseUrl).host);
        const context = await client.getDocContextByParsedRef(parsedRef, {
          question,
          maxChars: max_chars,
          includeResources: include_resources,
        });
        return createJsonToolResult(context);
      } catch (error) {
        return createToolErrorResult("get_doc_context", error);
      }
    },
  );
}
