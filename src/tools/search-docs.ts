import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Runtime } from "../services/runtime.js";
import {
  searchDocsInputSchema,
  searchDocsOutputSchema,
} from "../schemas/search-docs.js";
import {
  createJsonToolResult,
  createToolErrorResult,
  readOnlyToolAnnotations,
} from "./shared.js";

export function registerSearchDocsTool(
  server: McpServer,
  getRuntime: () => Promise<Runtime>,
): void {
  server.registerTool(
    "search_docs",
    {
      title: "Search ONES Docs",
      description: "Search ONES docs by keyword",
      inputSchema: searchDocsInputSchema,
      outputSchema: searchDocsOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async ({ query, limit }) => {
      try {
        const { client } = await getRuntime();
        const items = await client.searchDocs(query, limit);

        return createJsonToolResult({
          items,
          count: items.length,
          limit,
        });
      } catch (error) {
        return createToolErrorResult("search_docs", error);
      }
    },
  );
}
