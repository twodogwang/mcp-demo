import { afterEach, describe, expect, it, vi } from "vitest";
import { createOcrRunner } from "../../src/ocr/ocr-client";

describe("createOcrRunner", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns skipped when provider or endpoint is missing", async () => {
    const runOcr = createOcrRunner({
      provider: null,
      endpoint: null,
      apiKey: null,
      timeoutMs: 1000,
    });

    await expect(
      runOcr({ id: "img-1", src: "https://img.example/1.png" }),
    ).resolves.toEqual({
      status: "skipped",
      reason: "ocr_not_configured",
    });
  });

  it("returns failed status instead of throwing when provider errors", async () => {
    const runOcr = createOcrRunner({
      provider: "http",
      endpoint: "https://ocr.example/api",
      apiKey: "secret",
      timeoutMs: 1000,
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    await expect(runOcr({ id: "img-1", src: "https://img.example/1.png" }))
      .resolves.toMatchObject({ status: "failed" });
  });

  it("returns failed when provider is unsupported", async () => {
    const runOcr = createOcrRunner({
      provider: "mock",
      endpoint: "https://ocr.example/api",
      apiKey: null,
      timeoutMs: 1000,
    });

    await expect(
      runOcr({ id: "img-1", src: "https://img.example/1.png" }),
    ).resolves.toEqual({
      status: "failed",
      error: "unsupported_ocr_provider:mock",
    });
  });

  it("returns failed when provider responds with non-2xx status", async () => {
    const runOcr = createOcrRunner({
      provider: "http",
      endpoint: "https://ocr.example/api",
      apiKey: null,
      timeoutMs: 1000,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      }),
    );

    await expect(
      runOcr({ id: "img-1", src: "https://img.example/1.png" }),
    ).resolves.toEqual({
      status: "failed",
      error: "ocr_http_502",
    });
  });

  it("returns failed when provider times out", async () => {
    vi.useFakeTimers();

    const runOcr = createOcrRunner({
      provider: "http",
      endpoint: "https://ocr.example/api",
      apiKey: null,
      timeoutMs: 1000,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_input, init?: { signal?: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }),
    );

    const result = runOcr({ id: "img-1", src: "https://img.example/1.png" });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(result).resolves.toEqual({
      status: "failed",
      error: "aborted",
    });
  });

  it("returns ok when provider returns text and blocks", async () => {
    const runOcr = createOcrRunner({
      provider: "http",
      endpoint: "https://ocr.example/api",
      apiKey: "secret",
      timeoutMs: 1000,
    });

    const json = vi.fn().mockResolvedValue({
      text: "hello",
      blocks: [{ text: "hello", bbox: [0, 0, 10, 10] }],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json,
      }),
    );

    await expect(
      runOcr({ id: "img-1", src: "https://img.example/1.png" }),
    ).resolves.toEqual({
      status: "ok",
      text: "hello",
      blocks: [{ text: "hello", bbox: [0, 0, 10, 10] }],
    });
  });
});
