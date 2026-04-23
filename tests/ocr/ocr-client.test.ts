import { afterEach, describe, expect, it, vi } from "vitest";
import { createOcrRunner } from "../../src/ocr/ocr-client";

describe("createOcrRunner", () => {
  afterEach(() => {
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
