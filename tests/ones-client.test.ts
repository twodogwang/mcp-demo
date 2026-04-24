import { expect, it, vi } from "vitest";
import { OnesClient } from "../src/ones-client";

it("re-login once on 401 then succeeds", async () => {
  const getValidAuthHeaders = vi
    .fn<() => Promise<Record<string, string>>>()
    .mockResolvedValueOnce({ Authorization: "Bearer old" })
    .mockResolvedValueOnce({ Authorization: "Bearer new" })
    .mockResolvedValueOnce({ Authorization: "Bearer new" });
  const invalidate = vi.fn();

  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ items: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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
    { getValidAuthHeaders, invalidate },
    {
      resolveSearchPath: vi.fn().mockResolvedValue("/api/wiki/search"),
      resolveDocTemplate: vi.fn(),
      resolveRequirementTemplate: vi.fn(),
    } as any,
  );

  const result = await client.searchDocs("k", 5);
  expect(result).toEqual([]);
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(getValidAuthHeaders).toHaveBeenCalledTimes(3);
});

it("returns llm_view by default and preserves plain content coercion for non-string payload", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
    new Response(JSON.stringify({ id: "D-1", title: "Doc", content: 123 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

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
    {
      getValidAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer token" }),
      invalidate: vi.fn(),
    },
    {
      resolveSearchPath: vi.fn(),
      resolveDocTemplate: vi.fn().mockResolvedValue("/api/wiki/doc/{docId}"),
      resolveRequirementTemplate: vi.fn(),
    } as any,
  );

  const result = await client.getDoc("D-1");
  expect(result).toMatchObject({
    doc: {
      id: "D-1",
      title: "Doc",
      source_format: "plain",
    },
    llm_view: {
      type: "document",
      source_format: "plain",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "123" }],
        },
      ],
      resources: [],
    },
  });
  expect(result.human_view).toBeUndefined();
  expect(result.raw).toBeUndefined();
});

it("returns both views, raw payload, and ocr-enriched resources when requested", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "D-1",
          title: "Doc",
          content: "<h1>标题</h1><p>正文</p><img src=\"https://img.example/1.png\" alt=\"示意图\">",
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
          text: "图片里的文字",
          blocks: [{ text: "图片里的文字", bbox: [0, 0, 10, 10] }],
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
      baseUrl: "https://ones.example.internal",
      timeoutMs: 5000,
      maxContentChars: 20000,
      ocr: {
        provider: "http",
        endpoint: "https://ocr.example/api",
        apiKey: "secret",
        timeoutMs: 1000,
      },
    },
    {
      getValidAuthHeaders: vi.fn().mockResolvedValue({ Authorization: "Bearer token" }),
      invalidate: vi.fn(),
    },
    {
      resolveSearchPath: vi.fn(),
      resolveDocTemplate: vi.fn().mockResolvedValue("/api/wiki/doc/{docId}"),
      resolveRequirementTemplate: vi.fn(),
    } as any,
  );

  const result = await client.getDoc("D-1", {
    view: "both",
    includeRaw: true,
    includeResources: true,
  });

  expect(result).toMatchObject({
    doc: {
      id: "D-1",
      title: "Doc",
      source_format: "html",
    },
    llm_view: {
      type: "document",
      source_format: "html",
      children: [
        { type: "heading", level: 1 },
        { type: "paragraph" },
        { type: "image", resourceRef: "res-image-0" },
      ],
      resources: [
        {
          id: "res-image-0",
          src: "https://img.example/1.png",
          ocr: {
            status: "ok",
            text: "图片里的文字",
          },
        },
      ],
    },
    human_view: {
      format: "markdown",
      content: "# 标题\n\n正文\n\n![示意图](https://img.example/1.png)",
    },
    raw: {
      content: "<h1>标题</h1><p>正文</p><img src=\"https://img.example/1.png\" alt=\"示意图\">",
    },
  });
});

it("resolves relative wiki page resources to absolute editor resource urls", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uuid: "P-1",
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
      resolveDocTemplate: vi.fn(),
      resolveRequirementTemplate: vi.fn(),
    } as any,
  );

  const result = await client.getPageDoc("63FL1oSZ", "P-1", {
    view: "both",
    includeRaw: false,
    includeResources: true,
  });

  expect(result.llm_view?.resources).toEqual([
    {
      id: "res-image-0",
      type: "embed",
      embedType: "image",
      src: "https://ones.example.internal/wiki/api/wiki/editor/63FL1oSZ/CyyFbXuD/resources/GtOawA3kTPPgoj6A6ZEFIXyTcK4XvrWNnIrlMl_878A.png",
      alt: "image",
    },
  ]);
  expect(result.human_view?.content).toContain(
    "![image](https://ones.example.internal/wiki/api/wiki/editor/63FL1oSZ/CyyFbXuD/resources/GtOawA3kTPPgoj6A6ZEFIXyTcK4XvrWNnIrlMl_878A.png)",
  );
});
