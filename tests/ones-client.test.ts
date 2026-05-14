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

it("normalizes ONES task info into requirement detail", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
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

  expect(fetchMock).toHaveBeenCalledWith(
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

it("resolves requirement number through task search", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        tasks: [
          {
            uuid: "REQ-794",
            number: 794,
            summary: "管理后台需求",
            issue_type: { uuid: "15eiaFu6", name: "需求" },
            team_uuid: "63FL1oSZ",
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

  const result = await client.resolveRequirement("#794");

  expect(fetchMock).toHaveBeenCalledWith(
    "https://ones.example.internal/project/api/project/team/63FL1oSZ/task/search",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ keywords: "794", number: 794 }),
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
      { step: "search_task_by_number", value: "794" },
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
      new Response(JSON.stringify(requirementPayload), {
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
      new Response(JSON.stringify(bugPayload), {
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
