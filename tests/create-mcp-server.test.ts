import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, it } from "vitest";

import { createMcpServer } from "../src/server/create-mcp-server.js";

it("reports the npm package version in MCP server info", async () => {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
  ) as { version: string };

  const server = createMcpServer({
    getRuntime: () => Promise.reject(new Error("runtime unused in this test")),
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  expect(client.getServerVersion()).toMatchObject({
    name: "ones-doc-mcp",
    version: pkg.version,
  });

  await client.close();
  await server.close();
});
