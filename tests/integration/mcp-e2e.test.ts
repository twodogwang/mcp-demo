import { describe, expect, it, vi } from "vitest";

import { SessionManager } from "../../src/auth/session-manager";
import { OnesClient } from "../../src/ones-client";

describe("mcp e2e flow with mocked ones", () => {
  it("login -> search_docs -> get_doc with one re-login retry", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("ok", {
          status: 200,
          headers: { "set-cookie": "sid=first; Path=/; HttpOnly" },
        }),
      )
      .mockResolvedValueOnce(new Response("expired", { status: 401 }))
      .mockResolvedValueOnce(
        new Response("ok", {
          status: 200,
          headers: { "set-cookie": "sid=second; Path=/; HttpOnly" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [{ id: "D-1", title: "Doc 1" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "D-1",
            title: "Doc 1",
            content: "<p>Hello <b>ONES</b></p>",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const discovery = {
      resolveLoginPath: vi
        .fn()
        .mockResolvedValue({ path: "/api/account/login", cookie: "sid=seed" }),
      resolveSearchPath: vi.fn().mockResolvedValue("/api/wiki/search"),
      resolveDocTemplate: vi.fn().mockResolvedValue("/api/wiki/docs/{docId}"),
      resolveRequirementTemplate: vi.fn(),
    };

    const sessions = new SessionManager({
      baseUrl: "https://ones.example.internal",
      username: "u",
      password: "p",
      discovery: discovery as any,
    });

    const client = new OnesClient(
      {
        baseUrl: "https://ones.example.internal",
        timeoutMs: 5000,
        maxContentChars: 20000,
      },
      sessions,
      discovery as any,
    );

    const docs = await client.searchDocs("ONES", 3);
    expect(docs).toHaveLength(1);
    expect(docs[0]?.id).toBe("D-1");

    const doc = await client.getDoc("D-1");
    expect(doc.content).toBe("Hello ONES");
  });

  it("get_doc with #12345 returns latest linked doc content", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response("ok", {
          status: 200,
          headers: { "set-cookie": "sid=first; Path=/; HttpOnly" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            linked_docs: [
              { id: "D-1", updated_at: "2026-02-01T00:00:00Z" },
              { id: "D-2", updated_at: "2026-02-02T00:00:00Z" },
            ],
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
            id: "D-2",
            title: "Latest Doc",
            content: "<div>Latest <b>Content</b></div>",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const discovery = {
      resolveLoginPath: vi
        .fn()
        .mockResolvedValue({ path: "/api/account/login", cookie: "sid=seed" }),
      resolveSearchPath: vi.fn(),
      resolveDocTemplate: vi.fn().mockResolvedValue("/api/wiki/docs/{docId}"),
      resolveRequirementTemplate: vi
        .fn()
        .mockResolvedValue("/api/issues/{requirementId}"),
    };

    const sessions = new SessionManager({
      baseUrl: "https://ones.example.internal",
      username: "u",
      password: "p",
      discovery: discovery as any,
    });

    const client = new OnesClient(
      {
        baseUrl: "https://ones.example.internal",
        timeoutMs: 5000,
        maxContentChars: 20000,
      },
      sessions,
      discovery as any,
    );

    const doc = await client.getDocByRequirementId("12345");
    expect(doc.id).toBe("D-2");
    expect(doc.content).toBe("Latest Content");
  });
});
