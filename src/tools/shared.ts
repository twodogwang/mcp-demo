import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { AppError } from "../errors.js";
import { logError, serializeError } from "../logger.js";

export const readOnlyToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function createJsonToolResult<T extends Record<string, unknown>>(
  data: T,
): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function formatToolErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    switch (error.code) {
      case "AUTH_FAILED":
        return "ONES authentication failed. Check ONES_USERNAME and ONES_PASSWORD.";
      case "INVALID_DOC_REF":
        return "Invalid ref. Use a full ONES document URL or a #requirement id.";
      case "NO_LINKED_DOC":
        return "No linked docs found for the requirement. Check whether the requirement has linked wiki docs.";
      case "NOT_FOUND":
        return "The requested ONES document was not found.";
      case "DISCOVERY_FAILED":
        return "Failed to discover the ONES API path. Check ONES_BASE_URL and network access.";
      case "UPSTREAM_ERROR":
        return "ONES request failed upstream. Try again later or verify network connectivity.";
      default:
        return error.message;
    }
  }

  if (error instanceof Error) {
    if (error.message.startsWith("Missing required env:")) {
      return `Configuration error: ${error.message}`;
    }

    return error.message;
  }

  return String(error);
}

export function createToolErrorResult(
  toolName: string,
  error: unknown,
): CallToolResult {
  logError("mcp.tool.failed", {
    toolName,
    ...serializeError(error),
  });

  return {
    content: [{ type: "text", text: formatToolErrorMessage(error) }],
    isError: true,
  };
}
