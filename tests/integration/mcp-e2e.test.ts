import { describe, expect, it, vi } from "vitest";

import { OnesClient } from "../../src/ones-client";
import { parseRef } from "../../src/ref-parser";

describe("mcp e2e flow with mocked ones", () => {
  it("login -> search_docs -> get_doc with one re-login retry", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ id: "D-1", title: "Doc 1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "D-1",
            title: "Doc 1",
            content: "<p>Hello <b>ONES</b></p>",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const discovery = {
      resolveSearchPath: vi.fn().mockResolvedValue("/api/wiki/search"),
      resolveDocTemplate: vi.fn().mockResolvedValue("/api/wiki/docs/{docId}"),
      resolveRequirementTemplate: vi.fn(),
    };

    const sessions = {
      getValidAuthHeaders: vi
        .fn<() => Promise<Record<string, string>>>()
        .mockResolvedValueOnce({ Authorization: "Bearer old" })
        .mockResolvedValueOnce({ Authorization: "Bearer new" })
        .mockResolvedValueOnce({ Authorization: "Bearer new" }),
      invalidate: vi.fn(),
    };

    const client = new OnesClient(
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
      sessions as any,
      discovery as any,
    );

    const docs = await client.searchDocs("ONES", 3);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.id).toBe("D-1");

    const doc = await client.getDoc("D-1");
    expect(doc).toMatchObject({
      doc: {
        id: "D-1",
        title: "Doc 1",
        source_format: "html",
      },
      llm_view: {
        type: "document",
        source_format: "html",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", value: "Hello ONES" }],
          },
        ],
      },
    });
    expect(doc.human_view).toBeUndefined();
  });

  it("get_doc with #12345 returns latest linked doc content", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            linked_docs: [
              { id: "D-1", updated_at: "2026-02-01T00:00:00Z" },
              { id: "D-2", updated_at: "2026-02-02T00:00:00Z" },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "D-2",
            title: "Latest Doc",
            content: "<div>Latest <b>Content</b></div>",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const discovery = {
      resolveSearchPath: vi.fn(),
      resolveDocTemplate: vi.fn().mockResolvedValue("/api/wiki/docs/{docId}"),
      resolveRequirementTemplate: vi
        .fn()
        .mockResolvedValue("/api/issues/{requirementId}"),
    };

    const sessions = {
      getValidAuthHeaders: vi
        .fn<() => Promise<Record<string, string>>>()
        .mockResolvedValue({ Authorization: "Bearer ok" }),
      invalidate: vi.fn(),
    };

    const client = new OnesClient(
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
      sessions as any,
      discovery as any,
    );

    const doc = await client.getDocByRequirementId("12345");
    expect(doc).toMatchObject({
      doc: {
        id: "D-2",
        title: "Latest Doc",
        source_format: "html",
      },
      llm_view: {
        type: "document",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", value: "Latest Content" }],
          },
        ],
      },
    });
  });

  it("parses wiki page url and returns page content", async () => {
    const parsed = parseRef(
      "https://1s.oristand.com/wiki/#/team/63FL1oSZ/space/JhN6fj4M/page/9Pkrzqbf",
      "1s.oristand.com",
    );
    expect(parsed.kind).toBe("page");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: "#47520 后台管理系统数据权限重构",
            updated_at: "2026-03-11T07:36:00Z",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: JSON.stringify({
              blocks: [
                {
                  type: "text",
                  text: [{ insert: "#47520 后台管理系统数据权限重构" }],
                },
                {
                  type: "text",
                  text: [{ insert: "需求目的/背景" }],
                },
                {
                  type: "text",
                  text: [{ insert: "权限管理核心作用" }],
                },
              ],
            }),
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const discovery = {
      resolveSearchPath: vi.fn(),
      resolveDocTemplate: vi.fn(),
      resolveRequirementTemplate: vi.fn(),
    };

    const sessions = {
      getValidAuthHeaders: vi
        .fn<() => Promise<Record<string, string>>>()
        .mockResolvedValue({ Authorization: "Bearer ok" }),
      invalidate: vi.fn(),
    };

    const client = new OnesClient(
      {
        baseUrl: "https://1s.oristand.com",
        timeoutMs: 5000,
        maxContentChars: 20000,
        ocr: {
          provider: null,
          endpoint: null,
          apiKey: null,
          timeoutMs: 1000,
        },
      },
      sessions as any,
      discovery as any,
    );

    if (parsed.kind !== "page") {
      throw new Error("expected page ref");
    }

    const doc = await client.getPageDoc(parsed.teamId, parsed.pageId, {
      view: "both",
      includeRaw: true,
      includeResources: false,
    });
    expect(doc).toMatchObject({
      doc: {
        title: "#47520 后台管理系统数据权限重构",
        source_format: "richtext-json",
      },
      llm_view: {
        type: "document",
        source_format: "richtext-json",
        children: [
          {
            type: "paragraph",
            children: [{ type: "text", value: "#47520 后台管理系统数据权限重构" }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", value: "需求目的/背景" }],
          },
          {
            type: "paragraph",
            children: [{ type: "text", value: "权限管理核心作用" }],
          },
        ],
      },
      human_view: {
        format: "markdown",
      },
      raw: {
        content: expect.stringContaining("\"blocks\""),
      },
    });
    expect(doc.human_view?.content).toContain("需求目的/背景");
    expect(doc.human_view?.content).toContain("权限管理核心作用");
    expect(doc.llm_view?.resources).toBeUndefined();
  });

  it("renders wiki page human_view with absolute editor resource urls", async () => {
    const parsed = parseRef(
      "https://1s.oristand.com/wiki/#/team/63FL1oSZ/space/JhN6fj4M/page/KkVZSkGh",
      "1s.oristand.com",
    );
    expect(parsed.kind).toBe("page");

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            title: "Wiki Page",
            team_uuid: "63FL1oSZ",
            ref_uuid: "CyyFbXuD",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: JSON.stringify({
              blocks: [
                {
                  type: "text",
                  heading: 1,
                  text: [{ insert: "标题" }],
                },
                {
                  type: "embed",
                  embedType: "image",
                  embedData: {
                    src: "GtOawA3kTPPgoj6A6ZEFIXyTcK4XvrWNnIrlMl_878A.png",
                  },
                },
              ],
            }),
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const client = new OnesClient(
      {
        baseUrl: "https://1s.oristand.com",
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
        getValidAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer ok" }),
        invalidate: vi.fn(),
      } as any,
      {
        resolveSearchPath: vi.fn(),
        resolveDocTemplate: vi.fn(),
        resolveRequirementTemplate: vi.fn(),
      } as any,
    );

    if (parsed.kind !== "page") {
      throw new Error("expected page ref");
    }

    const doc = await client.getPageDoc(parsed.teamId, parsed.pageId, {
      view: "both",
      includeRaw: false,
      includeResources: true,
    });

    expect(doc.llm_view?.resources).toEqual([
      {
        id: "res-image-0",
        type: "embed",
        embedType: "image",
        src: "https://1s.oristand.com/wiki/api/wiki/editor/63FL1oSZ/CyyFbXuD/resources/GtOawA3kTPPgoj6A6ZEFIXyTcK4XvrWNnIrlMl_878A.png",
        alt: "image",
      },
    ]);
    expect(doc.human_view?.content).toContain(
      "![image](https://1s.oristand.com/wiki/api/wiki/editor/63FL1oSZ/CyyFbXuD/resources/GtOawA3kTPPgoj6A6ZEFIXyTcK4XvrWNnIrlMl_878A.png)",
    );
  });
});
