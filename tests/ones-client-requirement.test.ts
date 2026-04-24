import { expect, it, vi } from "vitest";

import { OnesClient } from "../src/ones-client";

it("returns latest linked doc content for requirement hash", async () => {
  const sessions = {
    getValidAuthHeaders: vi
      .fn<() => Promise<Record<string, string>>>()
      .mockResolvedValue({ Authorization: "Bearer ok" }),
    invalidate: vi.fn(),
  };

  const discovery = {
    resolveSearchPath: vi.fn(),
    resolveDocTemplate: vi.fn().mockResolvedValue("/api/wiki/docs/{docId}"),
    resolveRequirementTemplate: vi
      .fn()
      .mockResolvedValue("/api/issues/{requirementId}"),
  };

  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          linked_docs: [
            { id: "D-1", updated_at: "2026-01-01T00:00:00Z" },
            { id: "D-2", updated_at: "2026-02-01T00:00:00Z" },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: "D-2",
          title: "Latest",
          content: "<p>Hello <b>ONES</b></p>",
          updated_at: "2026-02-01T00:00:00Z",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
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
    } as any,
    sessions as any,
    discovery as any,
  );

  const out = await client.getDocByRequirementId("12345");
  expect(out).toMatchObject({
    doc: {
      id: "D-2",
      title: "Latest",
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
  expect(out.human_view).toBeUndefined();
});
