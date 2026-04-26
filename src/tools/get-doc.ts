import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { toGetDocOptions } from "../documents/model.js";
import type { Runtime } from "../services/runtime.js";
import { parseRef } from "../ref-parser.js";
import {
  getDocInputSchema,
  getDocOutputSchema,
} from "../schemas/get-doc.js";
import {
  createJsonToolResult,
  createToolErrorResult,
  readOnlyToolAnnotations,
} from "./shared.js";

export function registerGetDocTool(
  server: McpServer,
  getRuntime: () => Promise<Runtime>,
): void {
  server.registerTool(
    "get_doc",
    {
      title: "Get ONES Document",
      description:
        "Get ONES doc by context ref (URL or #requirement) and return llm/human structured views.",
      inputSchema: getDocInputSchema,
      outputSchema: getDocOutputSchema,
      annotations: readOnlyToolAnnotations,
    },
    async (input) => {
      try {
        const { cfg, client } = await getRuntime();
        const options = toGetDocOptions(input);
        const parsed = parseRef(input.ref, new URL(cfg.baseUrl).host);
        const doc =
          parsed.kind === "doc"
            ? await client.getDoc(parsed.docId, options)
            : parsed.kind === "page"
              ? await client.getPageDoc(parsed.teamId, parsed.pageId, options)
              : await client.getDocByRequirementId(parsed.requirementId, options);

        return createJsonToolResult(doc);
      } catch (error) {
        return createToolErrorResult("get_doc", error);
      }
    },
  );
}
