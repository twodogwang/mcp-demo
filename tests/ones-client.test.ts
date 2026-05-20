import { expect, it, vi } from "vitest";
import { AppError } from "../src/errors";
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

it("invalidates once on 403 and surfaces auth failure", async () => {
  const getValidAuthHeaders = vi
    .fn<() => Promise<Record<string, string>>>()
    .mockResolvedValueOnce({
      Authorization: "Bearer stale",
      Cookie: "ones-lt=abc",
    })
    .mockResolvedValueOnce({
      Authorization: "Bearer stale",
      Cookie: "ones-lt=abc",
    })
    .mockRejectedValueOnce(
      new AppError("AUTH_FAILED", "ONES external session expired", 403),
    );
  const invalidate = vi.fn();

  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response("forbidden", { status: 403 }));

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

  await expect(client.searchDocs("k", 5)).rejects.toMatchObject({
    code: "AUTH_FAILED",
    message: "ONES external session expired",
  });
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

it("gets requirement detail directly from a requirement number ref", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            buckets: [
              {
                tasks: [
                  {
                    uuid: "REQ-1",
                    number: 794,
                    name: "提现需求",
                    issueType: { uuid: "15eiaFu6", name: "需求" },
                    status: { uuid: "status-1", name: "进行中" },
                  },
                ],
              },
            ],
          },
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
          uuid: "REQ-1",
          number: 794,
          name: "提现需求",
          issueType: { uuid: "15eiaFu6", name: "需求" },
          status: { uuid: "status-1", name: "进行中" },
          desc: "<p>需求正文</p>",
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
      defaultTeamId: "TEAM-1",
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

  const result = await client.getRequirementDetailByRef("#794");

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "https://ones.example.internal/project/api/project/team/TEAM-1/items/graphql?t=group-task-data",
    expect.objectContaining({ method: "POST" }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "https://ones.example.internal/project/api/project/team/TEAM-1/task/REQ-1/info",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.entity).toMatchObject({
    entity_type: "requirement",
    task_id: "REQ-1",
    number: 794,
    summary: "提现需求",
  });
  expect(result.description.plain_text).toBe("需求正文");
});
