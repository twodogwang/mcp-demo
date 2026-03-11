import { describe, expect, it, vi } from "vitest";

import { EndpointDiscovery } from "../../src/discovery/endpoint-discovery";

describe("EndpointDiscovery", () => {
  it("discovers login and search endpoints from candidates", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("miss", { status: 404 }))
      .mockResolvedValueOnce(
        new Response("ok", {
          status: 200,
          headers: { "set-cookie": "sid=1; Path=/" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const discovery = new EndpointDiscovery("https://ones.example.internal", 5000);
    const endpoints = await discovery.resolveSearchFlow();

    expect(endpoints.loginPath).toBeDefined();
    expect(endpoints.searchPath).toBeDefined();
  });

  it("accepts identity login candidate before search discovery", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("miss", { status: 404 }))
      .mockResolvedValueOnce(new Response("miss", { status: 404 }))
      .mockResolvedValueOnce(
        new Response("ok", {
          status: 200,
          headers: { "set-cookie": "sid=identity; Path=/" },
        }),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const discovery = new EndpointDiscovery("https://1s.oristand.com", 5000);
    const login = await discovery.resolveLoginPath({
      username: "u",
      password: "p",
    });

    expect(login.path).toBe("/identity/api/login");
    expect(login.cookie).toBe("sid=identity");
  });
});
