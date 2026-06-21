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

it("returns markdown by default and preserves plain content coercion for non-string payload", async () => {
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
    markdown: "123",
  });
  expect(result).not.toHaveProperty("llm_view");
  expect(result).not.toHaveProperty("human_view");
  expect(result.raw).toBeUndefined();
});

it("returns markdown, raw payload, and image placeholders when requested", async () => {
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
    includeRaw: true,
    includeResources: true,
  });

  expect(result).toMatchObject({
    doc: {
      id: "D-1",
      title: "Doc",
      source_format: "html",
    },
    markdown: "# 标题\n\n正文\n\n![示意图](https://img.example/1.png)",
    raw: {
      content: "<h1>标题</h1><p>正文</p><img src=\"https://img.example/1.png\" alt=\"示意图\">",
    },
  });
  expect(result).not.toHaveProperty("llm_view");
  expect(result).not.toHaveProperty("human_view");
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
    includeRaw: false,
    includeResources: true,
  });

  expect(result.markdown).toContain(
    "![image](https://ones.example.internal/wiki/api/wiki/editor/63FL1oSZ/CyyFbXuD/resources/GtOawA3kTPPgoj6A6ZEFIXyTcK4XvrWNnIrlMl_878A.png)",
  );
  expect(result).not.toHaveProperty("llm_view");
});

it("normalizes ONES task info into requirement detail", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uuid: "REQ-794",
          number: 794,
          summary: "管理后台BD归属组筛选框兼容部门逻辑",
          desc: "<p>需求正文</p>",
          issue_type: { uuid: "15eiaFu6", name: "需求" },
          status: { uuid: "status-1", name: "进行中" },
          owner: { uuid: "user-1", name: "张三" },
          assign: { uuid: "user-2", name: "李四" },
          team_uuid: "63FL1oSZ",
          updated_at: "2026-05-14T10:20:30+08:00",
          related_tasks: [
            {
              uuid: "BUG-1",
              number: 127599,
              summary: "Buyer管理，BD总监点击转出无反应",
              issue_type: { uuid: "2eUNAjCL", name: "缺陷" },
            },
          ],
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
      defaultTeamId: "63FL1oSZ",
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

  const result = await client.getRequirementDetail("REQ-794");

  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "https://ones.example.internal/project/api/project/team/63FL1oSZ/task/REQ-794/info",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result).toMatchObject({
    entity: {
      entity_type: "requirement",
      task_id: "REQ-794",
      number: 794,
      summary: "管理后台BD归属组筛选框兼容部门逻辑",
      task_type: { id: "15eiaFu6", name: "需求" },
      status: { id: "status-1", name: "进行中" },
      owner: { id: "user-1", name: "张三" },
      assignee: { id: "user-2", name: "李四" },
      team: { id: "63FL1oSZ", name: null },
      url: "https://ones.example.internal/project/#/team/63FL1oSZ/task/REQ-794",
    },
    description: {
      plain_text: "需求正文",
      html: "<p>需求正文</p>",
    },
    related_tasks: [
      {
        entity_type: "bug",
        task_id: "BUG-1",
        number: 127599,
      },
    ],
  });
});

it("loads work-item detail through current ones-project onesql endpoint", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        data: [
          {
            type: "item",
            item: {
              uuid: "REQ-794",
              field001: "管理后台BD归属组筛选框兼容部门逻辑",
              field003: { uuid: "user-1", name: "张三" },
              field004: { uuid: "user-2", name: "李四" },
              field005: { uuid: "status-1", name: "进行中", category: "in_progress" },
              field006: { uuid: "project-1", name: "B2B" },
              field007: { uuid: "15eiaFu6", name: "需求", detail_type: 1 },
              field016: "<p>需求正文</p>",
              field903: "B2BG-129944",
              "v$issue_path": [
                {
                  uuid: "REQ-794",
                  number: 129944,
                  summary: "管理后台BD归属组筛选框兼容部门逻辑",
                  issueTypeUUID: "15eiaFu6",
                  display_id: "B2BG-129944",
                },
              ],
            },
          },
        ],
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
      defaultTeamId: "63FL1oSZ",
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

  const result = await client.getRequirementDetail("REQ-794");

  expect(fetchMock).toHaveBeenCalledWith(
    "https://ones.example.internal/project/api/ones-project/team/63FL1oSZ/workitems/onesql",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("from issue where uid(uuid) = uid('REQ-794')"),
    }),
  );
  expect(result).toMatchObject({
    entity: {
      entity_type: "requirement",
      task_id: "REQ-794",
      number: 129944,
      summary: "管理后台BD归属组筛选框兼容部门逻辑",
      task_type: { id: "15eiaFu6", name: "需求" },
      status: { id: "status-1", name: "进行中" },
      owner: { id: "user-1", name: "张三" },
      assignee: { id: "user-2", name: "李四" },
      team: { id: "63FL1oSZ", name: null },
    },
    description: {
      plain_text: "需求正文",
      html: "<p>需求正文</p>",
    },
  });
});

it("resolves requirement number through GraphQL number filter", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        data: {
          buckets: [
            {
              tasks: [
                {
                  uuid: "REQ-794",
                  number: 794,
                  name: "管理后台需求",
                  issueType: { uuid: "15eiaFu6", name: "需求", detailType: 1 },
                  status: { uuid: "status-1", name: "进行中", category: "in_progress" },
                  assign: { uuid: "user-2", name: "李四" },
                  project: { uuid: "project-1", name: "B2B" },
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
  );

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const client = new OnesClient(
    {
      baseUrl: "https://ones.example.internal",
      defaultTeamId: "63FL1oSZ",
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

  const result = await client.resolveRequirement("#794");

  expect(fetchMock).toHaveBeenCalledWith(
    "https://ones.example.internal/project/api/project/team/63FL1oSZ/items/graphql?t=group-task-data",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"number_in":[794]'),
    }),
  );
  expect(result).toMatchObject({
    input: "#794",
    matched: true,
    entity: {
      entity_type: "requirement",
      task_id: "REQ-794",
      number: 794,
    },
    resolution_path: [
      { step: "normalize_input", value: "#794" },
      { step: "search_task_by_number_graphql", value: "794" },
    ],
  });
});

it("loads requirement detail after resolving requirement number", async () => {
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
                    uuid: "REQ-794",
                    number: 794,
                    name: "管理后台需求",
                    issueType: { uuid: "15eiaFu6", name: "需求", detailType: 1 },
                    status: {
                      uuid: "status-1",
                      name: "进行中",
                      category: "in_progress",
                    },
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
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uuid: "REQ-794",
          number: 794,
          summary: "管理后台需求",
          desc: "<p>需求正文</p>",
          issue_type: { uuid: "15eiaFu6", name: "需求" },
          related_tasks: [
            {
              uuid: "TASK-1",
              number: 795,
              summary: "前端实现",
              issue_type: { uuid: "Q6tBhtVC", name: "任务" },
            },
          ],
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
      defaultTeamId: "63FL1oSZ",
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

  const resolved = await client.resolveRequirement("#794");
  const detail = await client.getRequirementDetail(resolved.entity?.task_id ?? "");

  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    "https://ones.example.internal/project/api/project/team/63FL1oSZ/task/REQ-794/info",
    expect.objectContaining({ method: "GET" }),
  );
  expect(detail).toMatchObject({
    entity: {
      task_id: "REQ-794",
      number: 794,
      summary: "管理后台需求",
    },
    description: {
      plain_text: "需求正文",
      html: "<p>需求正文</p>",
    },
    related_tasks: [
      {
        task_id: "TASK-1",
        number: 795,
        summary: "前端实现",
      },
    ],
  });
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
                    uuid: "REQ-794",
                    number: 794,
                    name: "管理后台需求",
                    issueType: { uuid: "15eiaFu6", name: "需求", detailType: 1 },
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
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uuid: "REQ-794",
          number: 794,
          summary: "管理后台需求",
          desc: "<p>需求正文</p>",
          issue_type: { uuid: "15eiaFu6", name: "需求" },
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
      defaultTeamId: "63FL1oSZ",
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
    "https://ones.example.internal/project/api/project/team/63FL1oSZ/items/graphql?t=group-task-data",
    expect.objectContaining({ method: "POST" }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    "https://ones.example.internal/project/api/project/team/63FL1oSZ/task/REQ-794/info",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.entity).toMatchObject({
    entity_type: "requirement",
    task_id: "REQ-794",
    number: 794,
    summary: "管理后台需求",
  });
  expect(result.description.plain_text).toBe("需求正文");
});

it("resolves requirement from workspace task URL", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uuid: "REQ-794",
          number: 794,
          summary: "管理后台需求",
          issue_type: { uuid: "15eiaFu6", name: "需求" },
          team_uuid: "63FL1oSZ",
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
      defaultTeamId: null,
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

  const result = await client.resolveRequirement(
    "https://ones.example.internal/project/#/workspace/team/63FL1oSZ/filter/view/ft-t-002/task/REQ-794",
  );

  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "https://ones.example.internal/project/api/project/team/63FL1oSZ/task/REQ-794/info",
    expect.objectContaining({
      method: "GET",
    }),
  );
  expect(result).toMatchObject({
    input:
      "https://ones.example.internal/project/#/workspace/team/63FL1oSZ/filter/view/ft-t-002/task/REQ-794",
    matched: true,
    entity: {
      entity_type: "requirement",
      task_id: "REQ-794",
      number: 794,
    },
    resolution_path: [
      {
        step: "normalize_input",
        value:
          "https://ones.example.internal/project/#/workspace/team/63FL1oSZ/filter/view/ft-t-002/task/REQ-794",
      },
      { step: "parse_task_url", value: "REQ-794" },
    ],
  });
});

it("resolves current issue URL through display identifier endpoint", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          display_id_path: "B2BG-129944",
          task_uuid: "REQ-129944",
          path: "REQ-129944",
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
          data: [
            {
              type: "item",
              item: {
                uuid: "REQ-129944",
                field001: "管理后台BD归属组筛选框兼容部门逻辑",
                field005: { uuid: "status-1", name: "进行中" },
                field007: { uuid: "15eiaFu6", name: "需求", detail_type: 1 },
                field016: "<p>需求正文</p>",
                field903: "B2BG-129944",
                "v$issue_path": [
                  {
                    uuid: "REQ-129944",
                    number: 129944,
                    summary: "管理后台BD归属组筛选框兼容部门逻辑",
                    display_id: "B2BG-129944",
                  },
                ],
              },
            },
          ],
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
      defaultTeamId: null,
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

  const result = await client.resolveRequirement(
    "https://ones.example.internal/project/#/workspace/team/63FL1oSZ/filter/view/ft-t-001/issue/B2BG-129944",
  );

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "https://ones.example.internal/project/api/ones-project/team/63FL1oSZ/tasks/identifier",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ display_id_path: "B2BG-129944" }),
    }),
  );
  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "https://ones.example.internal/project/api/ones-project/team/63FL1oSZ/workitems/onesql",
    expect.objectContaining({
      method: "POST",
      body: expect.stringContaining("from issue where uid(uuid) = uid('REQ-129944')"),
    }),
  );
  expect(result).toMatchObject({
    matched: true,
    entity: {
      entity_type: "requirement",
      task_id: "REQ-129944",
      number: 129944,
      summary: "管理后台BD归属组筛选框兼容部门逻辑",
    },
    resolution_path: [
      {
        step: "normalize_input",
        value:
          "https://ones.example.internal/project/#/workspace/team/63FL1oSZ/filter/view/ft-t-001/issue/B2BG-129944",
      },
      { step: "resolve_display_id_path", value: "B2BG-129944" },
    ],
  });
});

it("requires default team id when resolving numeric work-item refs", async () => {
  const client = new OnesClient(
    {
      baseUrl: "https://ones.example.internal",
      defaultTeamId: null,
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

  await expect(client.resolveRequirement("#794")).rejects.toMatchObject({
    code: "CONFIG_ERROR",
    message:
      "ONES_TEAM_ID is required for work-item tools when the task URL does not include a team id",
  });
});

it("extracts requirement materials from rich task content", async () => {
  const payload = {
    uuid: "REQ-794",
    number: 794,
    summary: "Buyer提现线上化",
    issue_type: { uuid: "15eiaFu6", name: "需求" },
    team_uuid: "63FL1oSZ",
    desc: "PRD：[#794 Buyer提现线上化]",
    related_wiki_pages: [
      {
        uuid: "KkVZSkGh",
        title: "#794 Buyer提现线上化",
        errorMessage: "",
      },
    ],
    field_values: [
      {
        field_uuid: "field016",
        value:
          '<p>PRD：<a href="https://ones.example.internal/wiki#/team/63FL1oSZ/page/KkVZSkGh">[#794 Buyer提现线上化]</a></p>' +
          '<p>原型：<a href="http://giga.usaxure.com/APJR4D?g=4">Axure</a></p>' +
          '<p>翻译文档：<a href="https://doc.weixin.qq.com/sheet/e3_AZ8AngbCANQCNk9blaF2rQDaPni5z?tab=BB08J2">腾讯文档</a></p>' +
          '<figure><img data-uuid="KRWhJ1H8" data-mime="image/png" data-ref-id="REQ-794" data-ref-type="task" src="https://ones.example.internal/ones-tmp-hz/image.png" /></figure>',
      },
    ],
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const client = new OnesClient(
    {
      baseUrl: "https://ones.example.internal",
      defaultTeamId: "63FL1oSZ",
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

  const result = await client.extractRequirementMaterials("REQ-794");

  expect(result).toMatchObject({
    requirement: {
      task_id: "REQ-794",
      number: 794,
    },
    wiki_pages: [
      {
        page_id: "KkVZSkGh",
        title: "#794 Buyer提现线上化",
        source: "related_wiki_pages",
      },
    ],
    external_links: [
      {
        kind: "prototype",
        url: "http://giga.usaxure.com/APJR4D?g=4",
      },
      {
        kind: "translation_doc",
        url: "https://doc.weixin.qq.com/sheet/e3_AZ8AngbCANQCNk9blaF2rQDaPni5z?tab=BB08J2",
      },
    ],
    rich_resources: [
      {
        type: "image",
        resource_id: "KRWhJ1H8",
        mime_type: "image/png",
        ref_id: "REQ-794",
        ref_type: "task",
      },
    ],
    completeness: {
      has_requirement_body: true,
      has_related_wiki_pages: true,
      has_external_links: true,
      has_rich_resources: true,
    },
  });
});

it("downloads ONES resource with existing auth session and returns base64 content", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
    new Response(new Uint8Array([116, 101, 115, 116]), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": "4",
        "content-disposition": 'inline; filename="mock-image.png"',
      },
    }),
  );

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const client = new OnesClient(
    {
      baseUrl: "https://ones.example.internal",
      defaultTeamId: "63FL1oSZ",
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
      getValidAuthHeaders: vi.fn().mockResolvedValue({
        Authorization: "Bearer token",
        Cookie: "ones_session=abc",
      }),
      invalidate: vi.fn(),
    },
    {
      resolveSearchPath: vi.fn(),
      resolveDocTemplate: vi.fn(),
      resolveRequirementTemplate: vi.fn(),
    } as any,
  );

  const result = await client.downloadResource(
    "https://ones.example.internal/wiki/api/wiki/editor/team-1/ref-1/resources/mock-image.png",
  );

  expect(fetchMock).toHaveBeenCalledWith(
    "https://ones.example.internal/wiki/api/wiki/editor/team-1/ref-1/resources/mock-image.png",
    expect.objectContaining({
      method: "GET",
      headers: expect.objectContaining({
        Authorization: "Bearer token",
        Cookie: "ones_session=abc",
      }),
    }),
  );
  expect(result).toEqual({
    url: "https://ones.example.internal/wiki/api/wiki/editor/team-1/ref-1/resources/mock-image.png",
    filename: "mock-image.png",
    mime_type: "image/png",
    size_bytes: 4,
    content_base64: "dGVzdA==",
  });
});

it("surfaces 405 resource download as upstream error without invalidating auth", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
    new Response("<title>405</title>", {
      status: 405,
      headers: { "content-type": "text/html" },
    }),
  );
  const getValidAuthHeaders = vi.fn().mockResolvedValue({
    Authorization: "Bearer token",
    Cookie: "ones_session=abc",
  });
  const invalidate = vi.fn();

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const client = new OnesClient(
    {
      baseUrl: "https://ones.example.internal",
      defaultTeamId: "63FL1oSZ",
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
      getValidAuthHeaders,
      invalidate,
    },
    {
      resolveSearchPath: vi.fn(),
      resolveDocTemplate: vi.fn(),
      resolveRequirementTemplate: vi.fn(),
    } as any,
  );

  await expect(
    client.downloadResource(
      "https://ones.example.internal/wiki/api/wiki/editor/team-1/ref-1/resources/mock-image.png",
    ),
  ).rejects.toMatchObject({
    code: "UPSTREAM_ERROR",
    status: 405,
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(getValidAuthHeaders).toHaveBeenCalledTimes(1);
  expect(invalidate).not.toHaveBeenCalled();
});

it("downloads rendered wiki page editor resources with the page content token", async () => {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          uuid: "KkVZSkGh",
          title: "#794 Buyer提现线上化",
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
          token: "editor-content-token",
          content: JSON.stringify({
            blocks: [
              {
                type: "embed",
                embedType: "image",
                embedData: {
                  src: "OeJZQ29mIPtnDfB449jIQdULfI4mLpXVyinnP24rai0.png",
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
    )
    .mockResolvedValueOnce(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: {
          "content-type": "image/png",
          "content-length": "4",
        },
      }),
    );

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const client = new OnesClient(
    {
      baseUrl: "https://ones.example.internal",
      defaultTeamId: "63FL1oSZ",
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

  const doc = await client.getPageDoc("63FL1oSZ", "KkVZSkGh");
  const imageUrl =
    "https://ones.example.internal/wiki/api/wiki/editor/63FL1oSZ/CyyFbXuD/resources/OeJZQ29mIPtnDfB449jIQdULfI4mLpXVyinnP24rai0.png";
  expect(doc.markdown).toBe(`![image](${imageUrl})`);

  const result = await client.downloadResource(imageUrl);

  expect(fetchMock).toHaveBeenLastCalledWith(
    `${imageUrl}?token=editor-content-token`,
    expect.objectContaining({
      method: "GET",
    }),
  );
  expect(result).toMatchObject({
    url: imageUrl,
    mime_type: "image/png",
    size_bytes: 4,
    content_base64: "iVBORw==",
  });
});

it("rejects downloading resource outside current ONES host", async () => {
  const client = new OnesClient(
    {
      baseUrl: "https://ones.example.internal",
      defaultTeamId: "63FL1oSZ",
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

  await expect(
    client.downloadResource("https://evil.example.com/image.png"),
  ).rejects.toMatchObject({
    code: "INVALID_INPUT",
    message: "Resource URL must belong to the configured ONES host",
  });
});

it("derives execution tasks, bugs, parent requirement, and messages from task info", async () => {
  const requirementPayload = {
    uuid: "REQ-1",
    number: 47520,
    summary: "后台管理系统数据权限重构",
    issue_type: { uuid: "15eiaFu6", name: "需求" },
    team_uuid: "63FL1oSZ",
    related_tasks: [
      {
        uuid: "TASK-1",
        number: 94308,
        summary: "#47520 后台管理系统数据权限重构",
        issue_type: { uuid: "Q6tBhtVC", name: "任务" },
      },
      {
        uuid: "BUG-1",
        number: 127599,
        summary: "Buyer管理，BD总监点击转出无反应",
        issue_type: { uuid: "2eUNAjCL", name: "缺陷" },
      },
    ],
  };
  const bugPayload = {
    uuid: "BUG-1",
    number: 127599,
    summary: "Buyer管理，BD总监点击转出无反应",
    desc: "<p>点击无反应</p>",
    issue_type: { uuid: "2eUNAjCL", name: "缺陷" },
    severity: { uuid: "sev-1", name: "严重" },
    priority: { uuid: "pri-1", name: "高" },
    team_uuid: "63FL1oSZ",
    related_tasks: [
      {
        uuid: "REQ-1",
        number: 47520,
        summary: "后台管理系统数据权限重构",
        issue_type: { uuid: "15eiaFu6", name: "需求" },
      },
    ],
    messages: [
      {
        uuid: "MSG-1",
        author: { uuid: "user-1", name: "张三" },
        created_at: "2026-05-14T09:00:00+08:00",
        content: "<p>只处理后台</p>",
      },
    ],
  };
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(requirementPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(requirementPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(bugPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(bugPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(bugPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

  vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

  const client = new OnesClient(
    {
      baseUrl: "https://ones.example.internal",
      defaultTeamId: "63FL1oSZ",
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

  await expect(client.getExecutionTasks("REQ-1")).resolves.toMatchObject({
    execution_tasks: [{ entity_type: "execution_task", task_id: "TASK-1" }],
  });
  await expect(client.listRequirementBugs("REQ-1")).resolves.toMatchObject({
    count: 1,
    bugs: [{ entity_type: "bug", task_id: "BUG-1" }],
  });
  await expect(client.getBugDetail("BUG-1")).resolves.toMatchObject({
    entity: { entity_type: "bug", task_id: "BUG-1" },
    severity: { id: "sev-1", name: "严重" },
    priority: { id: "pri-1", name: "高" },
  });
  await expect(client.getBugParentRequirement("BUG-1")).resolves.toMatchObject({
    bug: { task_id: "BUG-1" },
    requirement: { entity_type: "requirement", task_id: "REQ-1" },
  });
  await expect(client.getTaskMessages("BUG-1")).resolves.toMatchObject({
    messages: [
      {
        id: "MSG-1",
        author: { id: "user-1", name: "张三" },
        plain_text: "只处理后台",
      },
    ],
  });
});
