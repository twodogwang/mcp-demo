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
});
