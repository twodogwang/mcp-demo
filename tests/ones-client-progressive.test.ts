import { describe, expect, it, vi } from "vitest";

import { OnesClient } from "../src/ones-client";

function createClient() {
  return new OnesClient(
    {
      baseUrl: "https://ones.example.internal",
      timeoutMs: 5000,
      maxContentChars: 20000,
      ocr: {
        provider: null,
        endpoint: null,
        apiKey: null,
        timeoutMs: 1000,
      },
    },
    {
      getValidAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer token" }),
      invalidate: vi.fn(),
    },
    {
      resolveSearchPath: vi.fn(),
      resolveDocTemplate: vi.fn().mockResolvedValue("/api/wiki/docs/{docId}"),
      resolveRequirementTemplate: vi.fn(),
    } as any,
  );
}

function mockSimpleDocFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            id: "D-1",
            title: "权限文档",
            updated_at: "2026-04-26T00:00:00Z",
            content: "<h1>需求背景</h1><p>背景说明</p><h2>权限规则</h2><p>规则详情</p>",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    ) as unknown as typeof fetch,
  );
}

function mockTableDocFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            id: "D-1",
            title: "页面文档",
            updated_at: "2026-04-26T00:00:00Z",
            content:
              "<h1>2.1 PHP Buyer端</h1><p>页面说明</p><table><tr><th>页面元素</th><th>说明</th></tr><tr><td>申请按钮</td><td>提交审批</td></tr></table>",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    ) as unknown as typeof fetch,
  );
}

function mockNumberedSectionDocFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            id: "D-1",
            title: "PHP Buyer端文档",
            updated_at: "2026-04-26T00:00:00Z",
            content:
              "<h1>2.1 PHP Buyer端</h1><p>Buyer端包含多个前端页面，需要覆盖权限申请流程。</p><h2>2.1.1 申请页</h2><p>前端需要提供申请页，展示申请原因、提交按钮和审批状态。</p><h2>2.1.2 审批页</h2><p>审批页展示审批人、审批意见和流转记录。</p>",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    ) as unknown as typeof fetch,
  );
}

describe("OnesClient progressive retrieval", () => {
  it("returns document outline for a doc id", async () => {
    mockSimpleDocFetch();
    const client = createClient();

    const outline = await client.getDocOutline("D-1");

    expect(outline.doc).toMatchObject({
      id: "D-1",
      title: "权限文档",
      source_format: "html",
    });
    expect(outline.sections).toMatchObject([
      { id: "sec-1", path: "1", title: "需求背景" },
      { id: "sec-2", path: "1.1", title: "权限规则" },
    ]);
  });

  it("returns one section with descendants when requested", async () => {
    mockSimpleDocFetch();
    const client = createClient();

    const section = await client.getDocSection("D-1", "sec-1", {
      includeDescendants: true,
      includeResources: true,
    });

    expect(section.section).toMatchObject({
      id: "sec-1",
      path: "1",
      title: "需求背景",
    });
    expect(section.markdown).toContain("# 需求背景");
    expect(section.markdown).toContain("权限规则");
    expect(section).not.toHaveProperty("llm_view");
    expect(section).not.toHaveProperty("human_view");
    expect(section.truncated).toBe(false);
  });

  it("getDocSection returns markdown with table content", async () => {
    mockTableDocFetch();
    const client = createClient();

    const section = await client.getDocSection("D-1", "sec-1", {
      includeDescendants: true,
      includeResources: true,
    });

    expect(section.markdown).toMatch(/^# /);
    expect(section.markdown).toContain("页面元素");
    expect(section.markdown).toContain("申请按钮");
    expect(section).not.toHaveProperty("content");
    expect(section).not.toHaveProperty("human_view");
  });

  it("returns cursor-based chunks", async () => {
    mockSimpleDocFetch();
    const client = createClient();

    const first = await client.getDocChunks("D-1", {
      cursor: null,
      maxChars: 6,
      includeResources: true,
    });

    expect(first.chunk).toMatchObject({
      index: 0,
      section_ids: ["sec-1"],
    });
    expect(first.markdown).toContain("需求背景");
    expect(first.has_more).toBe(true);
    expect(first.next_cursor).toBe("chunk-1");

    const second = await client.getDocChunks("D-1", {
      cursor: "chunk-1",
      maxChars: 6,
      includeResources: true,
    });

    expect(second.chunk).toMatchObject({
      index: 1,
      section_ids: ["sec-2"],
    });
    expect(second.markdown).toContain("权限规则");
    expect(second.has_more).toBe(false);
    expect(second.next_cursor).toBeNull();
  });

  it("selects sections automatically for a targeted question", async () => {
    mockSimpleDocFetch();
    const client = createClient();

    const result = await client.getDocContext("D-1", {
      question: "权限规则里写了什么？",
      maxChars: 100,
      includeResources: true,
    });

    expect(result.strategy).toBe("targeted_sections");
    expect(result.selected_sections).toEqual(["sec-2"]);
    expect(result.markdown).toContain("权限规则");
    expect(result).not.toHaveProperty("context");
    expect(result.truncated).toBe(false);
  });

  it("selects numbered page section for natural language question", async () => {
    mockNumberedSectionDocFetch();
    const client = createClient();

    const result = await client.getDocContext("D-1", {
      question: "前端要做哪些页面",
      maxChars: 20,
      includeResources: true,
    });

    expect(result.strategy).toBe("targeted_sections");
    expect(result.selected_sections).toContain("sec-2");
    expect(result.markdown).toContain("申请页");
  });

  it("falls back to first chunk when no section matches over budget document", async () => {
    mockNumberedSectionDocFetch();
    const client = createClient();

    const result = await client.getDocContext("D-1", {
      question: "完全不相关的内容",
      maxChars: 20,
      includeResources: true,
    });

    expect(result.strategy).toBe("full_chunks");
    expect(result.reason).toBe("fallback_to_first_chunk");
    expect(result.selected_sections.length).toBeGreaterThan(0);
    expect(result.markdown.length).toBeGreaterThan(0);
  });
});
