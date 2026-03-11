import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../../src/auth/session-manager";

describe("SessionManager", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("performs identity login flow and returns bearer auth header", async () => {
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
    });

    const auth = await sm.getValidAuthHeaders();

    expect(auth).toEqual({ Authorization: "Bearer token-1" });
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://ones.example.internal/identity/api/encryption_cert",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://ones.example.internal/identity/api/login",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"email\":\"u@example.com\""),
      }),
    );
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
    expect(new Headers(finalizeCall?.[1]?.headers).get("Cookie")).toBe("ids-session=abc");

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
    expect(new Headers(callbackCall?.[1]?.headers).get("Cookie")).toBe("ids-session=abc");
  });
});
