import { expect, it, vi } from "vitest";
import { OnesClient } from "../src/ones-client";

it("re-login once on 401 then succeeds", async () => {
  const getValidCookie = vi
    .fn<() => Promise<string>>()
    .mockResolvedValueOnce("sid=old")
    .mockResolvedValueOnce("sid=new")
    .mockResolvedValueOnce("sid=new");
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
    { getValidCookie, invalidate },
    {
      resolveSearchPath: vi.fn().mockResolvedValue("/api/wiki/search"),
      resolveDocTemplate: vi.fn(),
      resolveRequirementTemplate: vi.fn(),
    } as any,
  );

  const result = await client.searchDocs("k", 5);
  expect(result).toEqual([]);
  expect(invalidate).toHaveBeenCalledTimes(1);
  expect(getValidCookie).toHaveBeenCalledTimes(3);
});
