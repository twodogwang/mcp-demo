import { expect, it, vi } from "vitest";

import { OnesClient } from "../src/ones-client";

it("returns latest linked doc content for requirement hash", async () => {
  const sessions = {
    getValidCookie: vi.fn<() => Promise<string>>().mockResolvedValue("sid=ok"),
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
    } as any,
    sessions as any,
    discovery as any,
  );

  const out = await client.getDocByRequirementId("12345");
  expect(out.id).toBe("D-2");
  expect(out.content).toBe("Hello ONES");
});
