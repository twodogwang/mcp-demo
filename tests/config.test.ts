import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const keys = [
  "ONES_BASE_URL",
  "ONES_USERNAME",
  "ONES_PASSWORD",
  "ONES_LOGIN_PATH",
  "ONES_SEARCH_PATH",
  "ONES_DOC_PATH_TEMPLATE",
  "ONES_TIMEOUT_MS",
  "ONES_MAX_CONTENT_CHARS",
  "ONES_OCR_PROVIDER",
  "ONES_OCR_ENDPOINT",
  "ONES_OCR_API_KEY",
  "ONES_OCR_TIMEOUT_MS",
] as const;

afterEach(() => {
  for (const key of keys) {
    delete process.env[key];
  }
});

describe("loadConfig", () => {
  it("requires only baseUrl/username/password", () => {
    process.env.ONES_BASE_URL = "https://ones.example.internal";
    process.env.ONES_USERNAME = "u";
    process.env.ONES_PASSWORD = "p";

    const cfg = loadConfig() as Record<string, unknown>;

    expect(cfg.baseUrl).toBe("https://ones.example.internal");
    expect(cfg.username).toBe("u");
    expect(cfg.password).toBe("p");
    expect("loginPath" in cfg).toBe(false);
    expect("searchPath" in cfg).toBe(false);
    expect("docPathTemplate" in cfg).toBe(false);
  });

  it("exposes ocr config with defaults and trims empty strings to null", () => {
    process.env.ONES_BASE_URL = "https://ones.example.internal";
    process.env.ONES_USERNAME = "u";
    process.env.ONES_PASSWORD = "p";
    process.env.ONES_OCR_PROVIDER = "";
    process.env.ONES_OCR_ENDPOINT = " ";
    process.env.ONES_OCR_API_KEY = "";

    const cfg = loadConfig();

    expect(cfg.ocr).toBeDefined();
    expect(cfg.ocr).toEqual({
      provider: null,
      endpoint: null,
      apiKey: null,
      timeoutMs: 15000,
    });
  });
});
