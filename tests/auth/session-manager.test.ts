import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../src/auth/session-manager";

describe("SessionManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("logs in and returns cookie string", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response("ok", {
          status: 200,
          headers: { "set-cookie": "sid=abc; Path=/; HttpOnly" },
        });
      }) as typeof fetch,
    );

    const sm = new SessionManager({
      baseUrl: "https://ones.example.internal",
      username: "u",
      password: "p",
      discovery: {
        resolveLoginPath: vi
          .fn()
          .mockResolvedValue({ path: "/api/account/login", cookie: "sid=seed" }),
      } as any,
    });

    const cookie = await sm.getValidCookie();
    expect(cookie).toBe("sid=abc");
  });
});
