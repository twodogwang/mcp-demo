import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import type { AppConfig } from "../src/config";
import type {
  DocDetail,
  DocumentChunkResult,
  DocumentContextResult,
  DocumentOutline,
  DocumentSectionDetail,
} from "../src/documents/model";
import { isCliEntrypoint } from "../src/index";
import { createMcpServer } from "../src/server/create-mcp-server";
import { parseGetDocInput } from "../src/schemas/get-doc";
import type { Runtime } from "../src/services/runtime";

const keys = [
  "ONES_BASE_URL",
  "ONES_USERNAME",
  "ONES_PASSWORD",
] as const;

const baseConfig: AppConfig = {
  baseUrl: "https://ones.example.internal",
  username: "demo",
  password: "secret",
  timeoutMs: 5000,
  maxContentChars: 20000,
  ocr: {
    provider: null,
    endpoint: null,
    apiKey: null,
    timeoutMs: 1000,
  },
};

function createRuntime(overrides?: {
  searchDocs?: Runtime["client"]["searchDocs"];
  getDocByRequirementId?: Runtime["client"]["getDocByRequirementId"];
  getDoc?: Runtime["client"]["getDoc"];
  getPageDoc?: Runtime["client"]["getPageDoc"];
  getDocOutline?: Runtime["client"]["getDocOutline"];
  getDocSection?: Runtime["client"]["getDocSection"];
  getDocChunks?: Runtime["client"]["getDocChunks"];
  getDocContext?: Runtime["client"]["getDocContext"];
  getDocOutlineByParsedRef?: Runtime["client"]["getDocOutlineByParsedRef"];
  getDocSectionByParsedRef?: Runtime["client"]["getDocSectionByParsedRef"];
  getDocChunksByParsedRef?: Runtime["client"]["getDocChunksByParsedRef"];
  getDocContextByParsedRef?: Runtime["client"]["getDocContextByParsedRef"];
}): Runtime {
  const fallbackDoc: DocDetail = {
    doc: {
      id: "D-1",
      title: "Doc 1",
      source_format: "html",
    },
    llm_view: {
      type: "document",
      source_format: "html",
      children: [],
      resources: [],
    },
  };
  const fallbackOutline: DocumentOutline = {
    doc: fallbackDoc.doc,
    estimated_chars: 20,
    section_count: 1,
    sections: [
      {
        id: "sec-1",
        path: "1",
        title: "Doc 1",
        level: 1,
        estimated_chars: 20,
        table_count: 0,
        image_count: 0,
        start_index: 0,
        end_index: 1,
      },
    ],
  };
  const fallbackSection: DocumentSectionDetail = {
    doc: fallbackDoc.doc,
    section: fallbackOutline.sections[0]!,
    content: fallbackDoc.llm_view!,
    truncated: false,
  };
  const fallbackChunk: DocumentChunkResult = {
    doc: fallbackDoc.doc,
    chunk: {
      cursor: "chunk-0",
      index: 0,
      section_ids: ["sec-1"],
      estimated_chars: 20,
      start_index: 0,
      end_index: 1,
    },
    content: fallbackDoc.llm_view!,
    has_more: false,
    next_cursor: null,
  };
  const fallbackContext: DocumentContextResult = {
    doc: fallbackDoc.doc,
    strategy: "targeted_sections",
    reason: "question_matches_section_title",
    selected_sections: ["sec-1"],
    consumed_chunks: [],
    truncated: false,
    context: fallbackDoc.llm_view!,
  };

  return {
    cfg: baseConfig,
    client: {
      searchDocs:
        overrides?.searchDocs ??
        vi.fn().mockResolvedValue([{ id: "D-1", title: "Doc 1" }]),
      getDocByRequirementId:
        overrides?.getDocByRequirementId ?? vi.fn().mockResolvedValue(fallbackDoc),
      getDoc: overrides?.getDoc ?? vi.fn().mockResolvedValue(fallbackDoc),
      getPageDoc: overrides?.getPageDoc ?? vi.fn().mockResolvedValue(fallbackDoc),
      getDocOutline:
        overrides?.getDocOutline ?? vi.fn().mockResolvedValue(fallbackOutline),
      getDocSection:
        overrides?.getDocSection ?? vi.fn().mockResolvedValue(fallbackSection),
      getDocChunks:
        overrides?.getDocChunks ?? vi.fn().mockResolvedValue(fallbackChunk),
      getDocContext:
        overrides?.getDocContext ?? vi.fn().mockResolvedValue(fallbackContext),
      getDocOutlineByParsedRef:
        overrides?.getDocOutlineByParsedRef ?? vi.fn().mockResolvedValue(fallbackOutline),
      getDocSectionByParsedRef:
        overrides?.getDocSectionByParsedRef ?? vi.fn().mockResolvedValue(fallbackSection),
      getDocChunksByParsedRef:
        overrides?.getDocChunksByParsedRef ?? vi.fn().mockResolvedValue(fallbackChunk),
      getDocContextByParsedRef:
        overrides?.getDocContextByParsedRef ?? vi.fn().mockResolvedValue(fallbackContext),
    } as Runtime["client"],
  };
}

async function connectTestClient(runtime: Runtime) {
  const server = createMcpServer({
    getRuntime: vi.fn().mockResolvedValue(runtime),
  });
  const client = new Client(
    { name: "test-client", version: "1.0.0" },
    { capabilities: {} },
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of keys) {
    delete process.env[key];
  }
});

describe("mcp tools", () => {
  it("exposes progressive retrieval tools with annotations and output schema", async () => {
    const { client, server } = await connectTestClient(createRuntime());

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual([
        "search_docs",
        "get_doc",
        "get_doc_outline",
        "get_doc_section",
        "get_doc_chunks",
        "get_doc_context",
      ]);

      const searchDocs = tools.tools.find((tool) => tool.name === "search_docs");
      const getDoc = tools.tools.find((tool) => tool.name === "get_doc");
      const getDocOutline = tools.tools.find((tool) => tool.name === "get_doc_outline");
      const getDocSection = tools.tools.find((tool) => tool.name === "get_doc_section");
      const getDocChunks = tools.tools.find((tool) => tool.name === "get_doc_chunks");
      const getDocContext = tools.tools.find((tool) => tool.name === "get_doc_context");

      expect(searchDocs?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
      expect(getDoc?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
      expect(searchDocs?.outputSchema?.properties).toHaveProperty("items");
      expect(getDoc?.outputSchema?.properties).toHaveProperty("doc");
      expect(getDocOutline?.outputSchema?.properties).toHaveProperty("sections");
      expect(getDocSection?.outputSchema?.properties).toHaveProperty("section");
      expect(getDocChunks?.outputSchema?.properties).toHaveProperty("chunk");
      expect(getDocContext?.outputSchema?.properties).toHaveProperty("strategy");
    } finally {
      await server.close();
      await client.close();
    }
  });

  it("parses get_doc runtime args with defaults and validates option types", () => {
    const withDefaults = parseGetDocInput({ ref: "#12345" });
    expect(withDefaults).toEqual({
      ref: "#12345",
      view: "llm",
      include_raw: false,
      include_resources: true,
    });

    const withExplicitOptions = parseGetDocInput({
      ref: "#12345",
      view: "both",
      include_raw: true,
      include_resources: false,
    });
    expect(withExplicitOptions).toEqual({
      ref: "#12345",
      view: "both",
      include_raw: true,
      include_resources: false,
    });

    expect(() =>
      parseGetDocInput({
        ref: "#12345",
        include_raw: "true",
      }),
    ).toThrow();
    expect(() => parseGetDocInput({ ref: "" })).toThrow();
  });

  it("returns structuredContent for search_docs and preserves JSON text content", async () => {
    const runtime = createRuntime({
      searchDocs: vi.fn().mockResolvedValue([{ id: "D-1", title: "Doc 1" }]),
    });
    const { client, server } = await connectTestClient(runtime);

    try {
      const result = await client.callTool({
        name: "search_docs",
        arguments: { query: "ONES", limit: 3 },
      });

      if (!("content" in result)) {
        throw new Error("expected CallToolResult");
      }

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        items: [{ id: "D-1", title: "Doc 1" }],
        count: 1,
        limit: 3,
      });
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: JSON.stringify(
          {
            items: [{ id: "D-1", title: "Doc 1" }],
            count: 1,
            limit: 3,
          },
          null,
          2,
        ),
      });
    } finally {
      await server.close();
      await client.close();
    }
  });

  it("returns structuredContent for get_doc", async () => {
    const doc: DocDetail = {
      doc: {
        id: "D-2",
        title: "Latest Doc",
        source_format: "html",
      },
      llm_view: {
        type: "document",
        source_format: "html",
        children: [],
        resources: [],
      },
    };
    const runtime = createRuntime({
      getDocByRequirementId: vi.fn().mockResolvedValue(doc),
    });
    const { client, server } = await connectTestClient(runtime);

    try {
      const result = await client.callTool({
        name: "get_doc",
        arguments: { ref: "#12345" },
      });

      if (!("content" in result)) {
        throw new Error("expected CallToolResult");
      }

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual(doc);
      expect(result.content[0]).toMatchObject({
        type: "text",
        text: JSON.stringify(doc, null, 2),
      });
    } finally {
      await server.close();
      await client.close();
    }
  });

  it("returns structuredContent for get_doc_chunks", async () => {
    const runtime = createRuntime({
      getDocChunksByParsedRef: vi.fn().mockResolvedValue({
        doc: {
          id: "D-1",
          title: "Doc 1",
          source_format: "html",
        },
        chunk: {
          cursor: "chunk-0",
          index: 0,
          section_ids: ["sec-1"],
          estimated_chars: 20,
          start_index: 0,
          end_index: 2,
        },
        content: {
          type: "document",
          source_format: "html",
          children: [],
          resources: [],
        },
        has_more: true,
        next_cursor: "chunk-1",
      } satisfies DocumentChunkResult),
    });
    const { client, server } = await connectTestClient(runtime);

    try {
      const result = await client.callTool({
        name: "get_doc_chunks",
        arguments: { ref: "#12345", max_chars: 20 },
      });

      if (!("content" in result)) {
        throw new Error("expected CallToolResult");
      }

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        chunk: {
          index: 0,
          section_ids: ["sec-1"],
        },
        has_more: true,
        next_cursor: "chunk-1",
      });
    } finally {
      await server.close();
      await client.close();
    }
  });

  it("returns structuredContent for get_doc_context", async () => {
    const runtime = createRuntime({
      getDocContextByParsedRef: vi.fn().mockResolvedValue({
        doc: {
          id: "D-1",
          title: "Doc 1",
          source_format: "html",
        },
        strategy: "targeted_sections",
        reason: "question_matches_section_title",
        selected_sections: ["sec-2"],
        consumed_chunks: [],
        truncated: false,
        context: {
          type: "document",
          source_format: "html",
          children: [],
          resources: [],
        },
      } satisfies DocumentContextResult),
    });
    const { client, server } = await connectTestClient(runtime);

    try {
      const result = await client.callTool({
        name: "get_doc_context",
        arguments: { ref: "#12345", question: "权限规则里写了什么？", max_chars: 200 },
      });

      if (!("content" in result)) {
        throw new Error("expected CallToolResult");
      }

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toMatchObject({
        strategy: "targeted_sections",
        reason: "question_matches_section_title",
        selected_sections: ["sec-2"],
        truncated: false,
      });
    } finally {
      await server.close();
      await client.close();
    }
  });

  it("creates the server before ONES env is configured", () => {
    expect(() => createMcpServer()).not.toThrow();
  });

  it("treats npm bin symlink path as direct cli execution", () => {
    const resolver = (input: string) => {
      if (input === "/tmp/node_modules/.bin/get-doc-content") {
        return "/tmp/node_modules/@bakarhythm/get-doc-content/dist/src/index.js";
      }
      return input;
    };

    expect(
      isCliEntrypoint(
        "file:///tmp/node_modules/@bakarhythm/get-doc-content/dist/src/index.js",
        "/tmp/node_modules/.bin/get-doc-content",
        resolver,
      ),
    ).toBe(true);
  });

  it("returns false for unrelated cli paths", () => {
    expect(
      isCliEntrypoint(
        "file:///tmp/node_modules/@bakarhythm/get-doc-content/dist/src/index.js",
        "/tmp/other-script.js",
        (input) => input,
      ),
    ).toBe(false);
  });
});
