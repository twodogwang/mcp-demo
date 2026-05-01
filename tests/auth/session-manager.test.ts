import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../src/auth/session-manager";

describe("SessionManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reuses injected external session headers without login requests", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const sm = new SessionManager({
      baseUrl: "https://ones.example.internal",
      username: null,
      password: null,
      discovery: {} as any,
      externalSession: {
        authToken: "token-1",
        cookie: "ones-lt=abc; ones-ids-sid=xyz",
        origin: null,
        referer: null,
        userAgent: "Mozilla/5.0 TestBrowser",
      },
    });

    const auth = await sm.getValidAuthHeaders();

    expect(auth).toEqual({
      Authorization: "Bearer token-1",
      Cookie: "ones-lt=abc; ones-ids-sid=xyz",
      Origin: "https://ones.example.internal",
      Referer: "https://ones.example.internal/project/",
      "User-Agent": "Mozilla/5.0 TestBrowser",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("performs identity login flow and returns browser-like auth headers", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            public_key:
              "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0nNWWhtl6eBlCet84Hfx\nIbd3qYWKXEoqEyHVDR8obuJWBed7vwJGuIa/E9Meyk/4YnqC7JL+dzBk1ox32ldy\nd/KhaX7uaCJwniqvAuI6/o2Y35BNWXODkfru78wvWTq83afUtSJ7D+gdfE2Uz5uK\nPPonLTrBJh+t3IYFYnvP5JSYZfYOIdOJ2P9UaeyNwrMGCrJIBeBGNP+d6Pm3v0k+\nU7KRBIA8EaNRhaPhcDVxguieIdaUe4f4sKcEwDLqyCUnRqcRuKd48rP20NblfNmM\nYMGhMVszq89lgL0G8hcmszVAuJBMbbB67ptUEtE2gVZ/1BUYWprwBL5nUuI/eWhk\nZwIDAQAB\n-----END PUBLIC KEY-----\n",
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
            org_users: [
              {
                org: { org_uuid: "WNY9uYYN", region_uuid: "default" },
                org_user: { org_user_uuid: "E4d6fw7D", status: 1 },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              "set-cookie": "ids-session=abc; Path=/; HttpOnly",
            },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location:
              "https://ones.example.internal/identity/organization_select?id=req-1",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            callback_url: "/authorize/callback?id=req-1",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location:
              "https://ones.example.internal/auth/authorize/callback?code=code-1&state=org_uuid%3DWNY9uYYN",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "token-1",
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
            user: { email: "u@example.com" },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const sm = new SessionManager({
      baseUrl: "https://ones.example.internal",
      username: "u@example.com",
      password: "p@ss",
      discovery: {} as any,
      externalSession: null,
    });

    const auth = await sm.getValidAuthHeaders();

    expect(auth).toMatchObject({
      Authorization: "Bearer token-1",
      Cookie: "ids-session=abc",
      Origin: "https://ones.example.internal",
      Referer: "https://ones.example.internal/project/",
      "User-Agent": expect.stringContaining("wxwork/5.0.8"),
    });
    const certCall = fetchMock.mock.calls[0];
    expect(certCall?.[0]).toBe("https://ones.example.internal/identity/api/encryption_cert");
    expect(certCall?.[1]).toEqual(expect.objectContaining({ method: "POST" }));
    const certHeaders = new Headers(certCall?.[1]?.headers);
    expect(certHeaders.get("Origin")).toBe("https://ones.example.internal");
    expect(certHeaders.get("Referer")).toBe("https://ones.example.internal/project/");
    expect(certHeaders.get("User-Agent")).toContain("wxwork/5.0.8");

    const loginCall = fetchMock.mock.calls[1];
    expect(loginCall?.[0]).toBe("https://ones.example.internal/identity/api/login");
    expect(loginCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"email\":\"u@example.com\""),
      }),
    );
    const loginHeaders = new Headers(loginCall?.[1]?.headers);
    expect(loginHeaders.get("Content-Type")).toBe("application/json");
    expect(loginHeaders.get("Origin")).toBe("https://ones.example.internal");
    expect(loginHeaders.get("Referer")).toBe("https://ones.example.internal/project/");
    expect(loginHeaders.get("User-Agent")).toContain("wxwork/5.0.8");

    const authorizeCall = fetchMock.mock.calls[2];
    expect(authorizeCall?.[0]).toBe("https://ones.example.internal/identity/authorize");
    expect(authorizeCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
      }),
    );
    const authorizeHeaders = new Headers(authorizeCall?.[1]?.headers);
    expect(authorizeHeaders.get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(authorizeHeaders.get("Cookie")).toBe("ids-session=abc");
    expect(authorizeHeaders.get("Origin")).toBe("https://ones.example.internal");
    expect(authorizeHeaders.get("Referer")).toBe(
      "https://ones.example.internal/project/",
    );
    expect(authorizeHeaders.get("User-Agent")).toContain("wxwork/5.0.8");

    const finalizeCall = fetchMock.mock.calls[3];
    expect(finalizeCall?.[0]).toBe(
      "https://ones.example.internal/identity/api/auth_request/finalize",
    );
    expect(finalizeCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          auth_request_id: "req-1",
          region_uuid: "default",
          org_uuid: "WNY9uYYN",
          org_user_uuid: "E4d6fw7D",
        }),
      }),
    );
    const finalizeHeaders = new Headers(finalizeCall?.[1]?.headers);
    expect(finalizeHeaders.get("Content-Type")).toBe("application/json");
    expect(finalizeHeaders.get("Cookie")).toBe("ids-session=abc");
    expect(finalizeHeaders.get("Origin")).toBe("https://ones.example.internal");
    expect(finalizeHeaders.get("Referer")).toBe(
      "https://ones.example.internal/project/",
    );
    expect(finalizeHeaders.get("User-Agent")).toContain("wxwork/5.0.8");

    const callbackCall = fetchMock.mock.calls[4];
    expect(callbackCall?.[0]).toBe(
      "https://ones.example.internal/authorize/callback?id=req-1",
    );
    expect(callbackCall?.[1]).toEqual(
      expect.objectContaining({
        method: "GET",
        redirect: "manual",
      }),
    );
    const callbackHeaders = new Headers(callbackCall?.[1]?.headers);
    expect(callbackHeaders.get("Cookie")).toBe("ids-session=abc");
    expect(callbackHeaders.get("Origin")).toBe("https://ones.example.internal");
    expect(callbackHeaders.get("Referer")).toBe(
      "https://ones.example.internal/project/",
    );
    expect(callbackHeaders.get("User-Agent")).toContain("wxwork/5.0.8");

    const tokenCall = fetchMock.mock.calls[5];
    expect(tokenCall?.[0]).toBe("https://ones.example.internal/identity/oauth/token");
    expect(tokenCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
      }),
    );
    const tokenHeaders = new Headers(tokenCall?.[1]?.headers);
    expect(tokenHeaders.get("Content-Type")).toBe(
      "application/x-www-form-urlencoded",
    );
    expect(tokenHeaders.get("Cookie")).toBe("ids-session=abc");
    expect(tokenHeaders.get("Origin")).toBe("https://ones.example.internal");
    expect(tokenHeaders.get("Referer")).toBe(
      "https://ones.example.internal/project/",
    );
    expect(tokenHeaders.get("User-Agent")).toContain("wxwork/5.0.8");
  });
});
