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
import type {
  BugDetailResult,
  BugParentRequirementResult,
  DownloadedResourceResult,
  ExecutionTasksResult,
  RequirementBugsResult,
  RequirementDetailResult,
  RequirementMaterialsResult,
  ResolveTaskResult,
  RelatedWikiPagesResult,
  TaskMessagesResult,
  TaskRichResourcesResult,
} from "../src/work-items/model";

const keys = [
  "ONES_BASE_URL",
  "ONES_USERNAME",
  "ONES_PASSWORD",
] as const;

const baseConfig: AppConfig = {
  baseUrl: "https://ones.example.internal",
  username: "demo",
  password: "secret",
  defaultTeamId: "team-1",
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
  getRequirementDetailByRef?: Runtime["client"]["getRequirementDetailByRef"];
  getExecutionTasksByRef?: Runtime["client"]["getExecutionTasksByRef"];
  extractRequirementMaterialsByRef?: Runtime["client"]["extractRequirementMaterialsByRef"];
  listRequirementBugsByRef?: Runtime["client"]["listRequirementBugsByRef"];
  getTaskMessagesByRef?: Runtime["client"]["getTaskMessagesByRef"];
  getRelatedWikiPagesByRef?: Runtime["client"]["getRelatedWikiPagesByRef"];
  getTaskRichResourcesByRef?: Runtime["client"]["getTaskRichResourcesByRef"];
  getBugDetailByRef?: Runtime["client"]["getBugDetailByRef"];
  getBugParentRequirementByRef?: Runtime["client"]["getBugParentRequirementByRef"];
  resolveRequirement?: Runtime["client"]["resolveRequirement"];
  getRequirementDetail?: Runtime["client"]["getRequirementDetail"];
  getExecutionTasks?: Runtime["client"]["getExecutionTasks"];
  resolveBug?: Runtime["client"]["resolveBug"];
  getBugDetail?: Runtime["client"]["getBugDetail"];
  getBugParentRequirement?: Runtime["client"]["getBugParentRequirement"];
  listRequirementBugs?: Runtime["client"]["listRequirementBugs"];
  getTaskMessages?: Runtime["client"]["getTaskMessages"];
  extractRequirementMaterials?: Runtime["client"]["extractRequirementMaterials"];
  getRelatedWikiPages?: Runtime["client"]["getRelatedWikiPages"];
  getTaskRichResources?: Runtime["client"]["getTaskRichResources"];
  downloadResource?: Runtime["client"]["downloadResource"];
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
  const fallbackRequirementEntity = {
    entity_type: "requirement" as const,
    task_id: "REQ-1",
    number: 794,
    summary: "需求 794",
    task_type: { id: "15eiaFu6", name: "需求" },
    status: { id: "status-1", name: "进行中" },
    owner: null,
    assignee: null,
    team: { id: "team-1", name: null },
    parent_task_id: null,
    url: "https://ones.example.internal/project/#/team/team-1/task/REQ-1",
    updated_at: undefined,
  };
  const fallbackBugEntity = {
    entity_type: "bug" as const,
    task_id: "BUG-1",
    number: 127599,
    summary: "Bug 127599",
    task_type: { id: "2eUNAjCL", name: "缺陷" },
    status: { id: "status-2", name: "待处理" },
    owner: null,
    assignee: null,
    team: { id: "team-1", name: null },
    parent_task_id: "REQ-1",
    url: "https://ones.example.internal/project/#/team/team-1/task/BUG-1",
    updated_at: undefined,
  };
  const fallbackResolveRequirement: ResolveTaskResult = {
    input: "#794",
    matched: true,
    entity: fallbackRequirementEntity,
    candidates: [],
    resolution_path: [{ step: "normalize_input", value: "#794" }],
    raw_payload: {},
  };
  const fallbackRequirementDetail: RequirementDetailResult = {
    entity: fallbackRequirementEntity,
    description: {
      plain_text: "需求正文",
      html: "<p>需求正文</p>",
      rich_text: null,
    },
    custom_fields: [],
    related_tasks: [],
    raw_payload: {},
  };
  const fallbackExecutionTasks: ExecutionTasksResult = {
    requirement: fallbackRequirementEntity,
    execution_tasks: [],
    raw_payload: {},
  };
  const fallbackResolveBug: ResolveTaskResult = {
    input: "#127599",
    matched: true,
    entity: fallbackBugEntity,
    candidates: [],
    resolution_path: [{ step: "normalize_input", value: "#127599" }],
    raw_payload: {},
  };
  const fallbackBugDetail: BugDetailResult = {
    entity: fallbackBugEntity,
    description: {
      plain_text: "Bug 描述",
      html: "<p>Bug 描述</p>",
      rich_text: null,
    },
    severity: null,
    priority: null,
    related_tasks: [],
    raw_payload: {},
  };
  const fallbackBugParentRequirement: BugParentRequirementResult = {
    bug: fallbackBugEntity,
    requirement: fallbackRequirementEntity,
    resolution_path: [],
    raw_payload: {},
  };
  const fallbackRequirementBugs: RequirementBugsResult = {
    requirement: fallbackRequirementEntity,
    bugs: [fallbackBugEntity],
    count: 1,
    raw_payload: {},
  };
  const fallbackTaskMessages: TaskMessagesResult = {
    entity: fallbackRequirementEntity,
    messages: [],
    raw_payload: {},
  };
  const fallbackRequirementMaterials: RequirementMaterialsResult = {
    requirement: fallbackRequirementEntity,
    wiki_pages: [
      {
        page_id: "PAGE-1",
        team_id: "team-1",
        title: "需求 PRD",
        url: "https://ones.example.internal/wiki#/team/team-1/page/PAGE-1",
        source: "related_wiki_pages",
        error: null,
      },
    ],
    external_links: [
      {
        url: "http://giga.usaxure.com/APJR4D?g=4",
        kind: "prototype",
        source: "field_values.field016",
      },
    ],
    rich_resources: [
      {
        type: "image",
        resource_id: "IMG-1",
        src: "https://ones.example.internal/image.png",
        mime_type: "image/png",
        alt: null,
        ref_id: "REQ-1",
        ref_type: "task",
        source: "field_values.field016",
      },
    ],
    completeness: {
      has_requirement_body: true,
      has_related_wiki_pages: true,
      has_external_links: true,
      has_rich_resources: true,
      missing: [],
      next_actions: [
        "fetch_related_wiki_pages",
        "review_external_links",
        "persist_or_review_rich_resources",
        "fetch_task_messages_if_needed",
      ],
    },
    raw_payload: {},
  };
  const fallbackRelatedWikiPages: RelatedWikiPagesResult = {
    requirement: fallbackRequirementEntity,
    wiki_pages: fallbackRequirementMaterials.wiki_pages,
    raw_payload: {},
  };
  const fallbackTaskRichResources: TaskRichResourcesResult = {
    entity: fallbackRequirementEntity,
    resources: fallbackRequirementMaterials.rich_resources,
    raw_payload: {},
  };
  const fallbackDownloadedResource: DownloadedResourceResult = {
    url: "https://ones.example.internal/wiki/api/wiki/editor/team-1/ref-1/resources/IMG-1.png",
    filename: "IMG-1.png",
    mime_type: "image/png",
    size_bytes: 4,
    content_base64: "dGVzdA==",
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
      getRequirementDetailByRef:
        overrides?.getRequirementDetailByRef ??
        vi.fn().mockResolvedValue(fallbackRequirementDetail),
      getExecutionTasksByRef:
        overrides?.getExecutionTasksByRef ??
        vi.fn().mockResolvedValue(fallbackExecutionTasks),
      extractRequirementMaterialsByRef:
        overrides?.extractRequirementMaterialsByRef ??
        vi.fn().mockResolvedValue(fallbackRequirementMaterials),
      listRequirementBugsByRef:
        overrides?.listRequirementBugsByRef ??
        vi.fn().mockResolvedValue(fallbackRequirementBugs),
      getTaskMessagesByRef:
        overrides?.getTaskMessagesByRef ??
        vi.fn().mockResolvedValue(fallbackTaskMessages),
      getRelatedWikiPagesByRef:
        overrides?.getRelatedWikiPagesByRef ??
        vi.fn().mockResolvedValue(fallbackRelatedWikiPages),
      getTaskRichResourcesByRef:
        overrides?.getTaskRichResourcesByRef ??
        vi.fn().mockResolvedValue(fallbackTaskRichResources),
      getBugDetailByRef:
        overrides?.getBugDetailByRef ?? vi.fn().mockResolvedValue(fallbackBugDetail),
      getBugParentRequirementByRef:
        overrides?.getBugParentRequirementByRef ??
        vi.fn().mockResolvedValue(fallbackBugParentRequirement),
      resolveRequirement:
        overrides?.resolveRequirement ?? vi.fn().mockResolvedValue(fallbackResolveRequirement),
      getRequirementDetail:
        overrides?.getRequirementDetail ?? vi.fn().mockResolvedValue(fallbackRequirementDetail),
      getExecutionTasks:
        overrides?.getExecutionTasks ?? vi.fn().mockResolvedValue(fallbackExecutionTasks),
      resolveBug:
        overrides?.resolveBug ?? vi.fn().mockResolvedValue(fallbackResolveBug),
      getBugDetail:
        overrides?.getBugDetail ?? vi.fn().mockResolvedValue(fallbackBugDetail),
      getBugParentRequirement:
        overrides?.getBugParentRequirement ??
        vi.fn().mockResolvedValue(fallbackBugParentRequirement),
      listRequirementBugs:
        overrides?.listRequirementBugs ?? vi.fn().mockResolvedValue(fallbackRequirementBugs),
      getTaskMessages:
        overrides?.getTaskMessages ?? vi.fn().mockResolvedValue(fallbackTaskMessages),
      extractRequirementMaterials:
        overrides?.extractRequirementMaterials ??
        vi.fn().mockResolvedValue(fallbackRequirementMaterials),
      getRelatedWikiPages:
        overrides?.getRelatedWikiPages ??
        vi.fn().mockResolvedValue(fallbackRelatedWikiPages),
      getTaskRichResources:
        overrides?.getTaskRichResources ??
        vi.fn().mockResolvedValue(fallbackTaskRichResources),
      downloadResource:
        overrides?.downloadResource ??
        vi.fn().mockResolvedValue(fallbackDownloadedResource),
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
        "get_requirement_detail_by_ref",
        "get_execution_tasks_by_ref",
        "extract_requirement_materials_by_ref",
        "list_requirement_bugs_by_ref",
        "get_task_messages_by_ref",
        "get_related_wiki_pages_by_ref",
        "get_task_rich_resources_by_ref",
        "get_bug_detail_by_ref",
        "get_bug_parent_requirement_by_ref",
        "resolve_requirement",
        "get_requirement_detail",
        "get_execution_tasks",
        "resolve_bug",
        "get_bug_detail",
        "get_bug_parent_requirement",
        "list_requirement_bugs",
        "get_task_messages",
        "extract_requirement_materials",
        "get_related_wiki_pages",
        "get_task_rich_resources",
        "download_ones_resource",
      ]);

      const searchDocs = tools.tools.find((tool) => tool.name === "search_docs");
      const getDoc = tools.tools.find((tool) => tool.name === "get_doc");
      const getDocOutline = tools.tools.find((tool) => tool.name === "get_doc_outline");
      const getDocSection = tools.tools.find((tool) => tool.name === "get_doc_section");
      const getDocChunks = tools.tools.find((tool) => tool.name === "get_doc_chunks");
      const getDocContext = tools.tools.find((tool) => tool.name === "get_doc_context");
      const getRequirementDetailByRef = tools.tools.find(
        (tool) => tool.name === "get_requirement_detail_by_ref",
      );
      const resolveRequirement = tools.tools.find(
        (tool) => tool.name === "resolve_requirement",
      );
      const getRequirementDetail = tools.tools.find(
        (tool) => tool.name === "get_requirement_detail",
      );
      const listRequirementBugs = tools.tools.find(
        (tool) => tool.name === "list_requirement_bugs",
      );
      const downloadOnesResource = tools.tools.find(
        (tool) => tool.name === "download_ones_resource",
      );

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
      expect(getRequirementDetailByRef?.inputSchema?.properties).toHaveProperty("ref");
      expect(getRequirementDetailByRef?.outputSchema?.properties).toHaveProperty("entity");
      expect(resolveRequirement?.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
      expect(resolveRequirement?.outputSchema?.properties).toHaveProperty("entity");
      expect(getRequirementDetail?.outputSchema?.properties).toHaveProperty("description");
      expect(listRequirementBugs?.outputSchema?.properties).toHaveProperty("bugs");
      expect(downloadOnesResource?.inputSchema?.properties).toHaveProperty("url");
      expect(downloadOnesResource?.outputSchema?.properties).toHaveProperty("content_base64");
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

  it("returns structuredContent for all work-item tools", async () => {
    const resolveRequirement = vi.fn().mockResolvedValue({
      input: "#794",
      matched: true,
      entity: {
        entity_type: "requirement",
        task_id: "REQ-794",
        number: 794,
        summary: "管理后台需求",
        task_type: { id: "15eiaFu6", name: "需求" },
        status: { id: "status-1", name: "进行中" },
        owner: null,
        assignee: null,
        team: { id: "63FL1oSZ", name: null },
        parent_task_id: null,
        url: "https://ones.example.internal/project/#/team/63FL1oSZ/task/REQ-794",
        updated_at: undefined,
      },
      candidates: [],
      resolution_path: [{ step: "normalize_input", value: "#794" }],
      raw_payload: {},
    } satisfies ResolveTaskResult);
    const getRequirementDetail = vi.fn().mockResolvedValue({
      entity: {
        entity_type: "requirement",
        task_id: "REQ-794",
        number: 794,
        summary: "管理后台需求",
        task_type: { id: "15eiaFu6", name: "需求" },
        status: null,
        owner: null,
        assignee: null,
        team: { id: "63FL1oSZ", name: null },
        parent_task_id: null,
        url: null,
      },
      description: { plain_text: "需求正文", html: "<p>需求正文</p>", rich_text: null },
      custom_fields: [],
      related_tasks: [],
      raw_payload: {},
    } satisfies RequirementDetailResult);
    const getExecutionTasks = vi.fn().mockResolvedValue({
      requirement: (await getRequirementDetail()).entity,
      execution_tasks: [],
      raw_payload: {},
    } satisfies ExecutionTasksResult);
    const resolveBug = vi.fn().mockResolvedValue({
      input: "#127599",
      matched: true,
      entity: {
        entity_type: "bug",
        task_id: "BUG-1",
        number: 127599,
        summary: "Bug",
        task_type: { id: "2eUNAjCL", name: "缺陷" },
        status: null,
        owner: null,
        assignee: null,
        team: { id: "63FL1oSZ", name: null },
        parent_task_id: null,
        url: null,
      },
      candidates: [],
      resolution_path: [],
      raw_payload: {},
    } satisfies ResolveTaskResult);
    const getBugDetail = vi.fn().mockResolvedValue({
      entity: (await resolveBug()).entity!,
      description: { plain_text: "Bug 描述", html: "<p>Bug 描述</p>", rich_text: null },
      severity: null,
      priority: null,
      related_tasks: [],
      raw_payload: {},
    } satisfies BugDetailResult);
    const getBugParentRequirement = vi.fn().mockResolvedValue({
      bug: (await resolveBug()).entity!,
      requirement: (await getRequirementDetail()).entity,
      resolution_path: [],
      raw_payload: {},
    } satisfies BugParentRequirementResult);
    const listRequirementBugs = vi.fn().mockResolvedValue({
      requirement: (await getRequirementDetail()).entity,
      bugs: [(await resolveBug()).entity!],
      count: 1,
      raw_payload: {},
    } satisfies RequirementBugsResult);
    const getTaskMessages = vi.fn().mockResolvedValue({
      entity: (await getRequirementDetail()).entity,
      messages: [],
      raw_payload: {},
    } satisfies TaskMessagesResult);
    const wikiPages = [
      {
        page_id: "PAGE-1",
        team_id: "team-1",
        title: "需求 PRD",
        url: "https://ones.example.internal/wiki#/team/team-1/page/PAGE-1",
        source: "related_wiki_pages",
        error: null,
      },
    ];
    const extractRequirementMaterials = vi.fn().mockResolvedValue({
      requirement: (await getRequirementDetail()).entity,
      wiki_pages: wikiPages,
      external_links: [],
      rich_resources: [],
      completeness: {
        has_requirement_body: true,
        has_related_wiki_pages: true,
        has_external_links: false,
        has_rich_resources: false,
        missing: [],
        next_actions: ["fetch_related_wiki_pages", "fetch_task_messages_if_needed"],
      },
      raw_payload: {},
    } satisfies RequirementMaterialsResult);
    const getRelatedWikiPages = vi.fn().mockResolvedValue({
      requirement: (await getRequirementDetail()).entity,
      wiki_pages: wikiPages,
      raw_payload: {},
    } satisfies RelatedWikiPagesResult);
    const getTaskRichResources = vi.fn().mockResolvedValue({
      entity: (await getRequirementDetail()).entity,
      resources: [],
      raw_payload: {},
    } satisfies TaskRichResourcesResult);
    const downloadResource = vi.fn().mockResolvedValue({
      url: "https://ones.example.internal/wiki/api/wiki/editor/team-1/ref-1/resources/IMG-1.png",
      filename: "IMG-1.png",
      mime_type: "image/png",
      size_bytes: 4,
      content_base64: "dGVzdA==",
    } satisfies DownloadedResourceResult);
    const runtime = createRuntime({
      resolveRequirement,
      getRequirementDetail,
      getExecutionTasks,
      resolveBug,
      getBugDetail,
      getBugParentRequirement,
      listRequirementBugs,
      getTaskMessages,
      extractRequirementMaterials,
      getRelatedWikiPages,
      getTaskRichResources,
      downloadResource,
    });
    const { client, server } = await connectTestClient(runtime);

    try {
      const resolveRequirementResult = await client.callTool({
        name: "resolve_requirement",
        arguments: { ref: "#794" },
      });
      const requirementDetailByRefResult = await client.callTool({
        name: "get_requirement_detail_by_ref",
        arguments: { ref: "#794" },
      });

      if (!("content" in resolveRequirementResult)) {
        throw new Error("expected CallToolResult");
      }

      expect(resolveRequirement).toHaveBeenCalledWith("#794");
      expect(resolveRequirementResult.isError).toBeUndefined();
      expect(resolveRequirementResult.structuredContent).toMatchObject({
        matched: true,
        entity: {
          entity_type: "requirement",
          task_id: "REQ-794",
          number: 794,
        },
      });
      expect(requirementDetailByRefResult.structuredContent).toMatchObject({
        entity: {
          entity_type: "requirement",
          task_id: "REQ-1",
          number: 794,
        },
      });
      await client.callTool({
        name: "get_requirement_detail",
        arguments: { task_id: "REQ-794" },
      });
      await client.callTool({
        name: "get_execution_tasks",
        arguments: { task_id: "REQ-794" },
      });
      await client.callTool({
        name: "resolve_bug",
        arguments: { ref: "#127599" },
      });
      await client.callTool({
        name: "get_bug_detail",
        arguments: { task_id: "BUG-1" },
      });
      await client.callTool({
        name: "get_bug_parent_requirement",
        arguments: { task_id: "BUG-1" },
      });
      const listBugsResult = await client.callTool({
        name: "list_requirement_bugs",
        arguments: { task_id: "REQ-794" },
      });
      await client.callTool({
        name: "get_task_messages",
        arguments: { task_id: "REQ-794" },
      });
      const materialsResult = await client.callTool({
        name: "extract_requirement_materials",
        arguments: { task_id: "REQ-794" },
      });
      await client.callTool({
        name: "get_related_wiki_pages",
        arguments: { task_id: "REQ-794" },
      });
      await client.callTool({
        name: "get_task_rich_resources",
        arguments: { task_id: "REQ-794" },
      });
      const downloadResult = await client.callTool({
        name: "download_ones_resource",
        arguments: {
          url: "https://ones.example.internal/wiki/api/wiki/editor/team-1/ref-1/resources/IMG-1.png",
        },
      });

      expect(getRequirementDetail).toHaveBeenCalledWith("REQ-794", undefined);
      expect(getExecutionTasks).toHaveBeenCalledWith("REQ-794", undefined);
      expect(resolveBug).toHaveBeenCalledWith("#127599");
      expect(getBugDetail).toHaveBeenCalledWith("BUG-1", undefined);
      expect(getBugParentRequirement).toHaveBeenCalledWith("BUG-1", undefined);
      expect(listRequirementBugs).toHaveBeenCalledWith("REQ-794", undefined);
      expect(getTaskMessages).toHaveBeenCalledWith("REQ-794", undefined);
      expect(extractRequirementMaterials).toHaveBeenCalledWith("REQ-794", undefined);
      expect(getRelatedWikiPages).toHaveBeenCalledWith("REQ-794", undefined);
      expect(getTaskRichResources).toHaveBeenCalledWith("REQ-794", undefined);
      expect(downloadResource).toHaveBeenCalledWith(
        "https://ones.example.internal/wiki/api/wiki/editor/team-1/ref-1/resources/IMG-1.png",
      );
      expect(listBugsResult.structuredContent).toMatchObject({
        count: 1,
        bugs: [{ entity_type: "bug", task_id: "BUG-1" }],
      });
      expect(materialsResult.structuredContent).toMatchObject({
        wiki_pages: [{ page_id: "PAGE-1" }],
        completeness: {
          has_requirement_body: true,
          has_related_wiki_pages: true,
        },
      });
      expect(downloadResult.structuredContent).toMatchObject({
        filename: "IMG-1.png",
        mime_type: "image/png",
        content_base64: "dGVzdA==",
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
