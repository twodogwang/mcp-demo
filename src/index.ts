#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  getRuntimeEnvMeta,
  logError,
  logInfo,
  serializeError,
} from "./logger.js";
import { createMcpServer } from "./server/create-mcp-server.js";
import { startStdioServer } from "./transports/stdio.js";

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

export { createMcpServer, startStdioServer };

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

  logInfo("mcp.startup.begin", getRuntimeEnvMeta());
  startStdioServer()
    .then(() => {
      logInfo("mcp.startup.ready", getRuntimeEnvMeta());
    })
    .catch((error) => {
      logError("mcp.startup.failed", {
        ...getRuntimeEnvMeta(),
        ...serializeError(error),
      });
      process.exit(1);
    });
}
