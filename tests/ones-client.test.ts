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
