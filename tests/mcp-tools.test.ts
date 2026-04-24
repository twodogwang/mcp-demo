import { afterEach, describe, expect, it } from "vitest";
import { buildToolList, createServer, isCliEntrypoint } from "../src/index";

const keys = [
  "ONES_BASE_URL",
  "ONES_USERNAME",
  "ONES_PASSWORD",
] as const;

afterEach(() => {
  for (const key of keys) {
    delete process.env[key];
  }
});

describe("mcp tool list", () => {
  it("exposes search_docs and get_doc", () => {
    const tools = buildToolList();
    expect(tools.map((t) => t.name)).toEqual(["search_docs", "get_doc"]);
  });

  it("requires ref instead of doc_id", () => {
    const getDoc = buildToolList().find((t) => t.name === "get_doc");
    const schema = getDoc?.inputSchema as {
      required?: string[];
    };

    expect(schema.required).toEqual(["ref"]);
  });

  it("creates the server before ONES env is configured", () => {
    expect(() => createServer()).not.toThrow();
  });

  it("treats npm bin symlink path as direct cli execution", () => {
    const resolver = (input: string) => {
      if (input === "/tmp/node_modules/.bin/get-doc-content") {
        return "/tmp/node_modules/@bakarhythm/get-doc-content/dist/src/index.js";
      }
      return input;
    };

    expect(
      isCliEntrypoint(
        "file:///tmp/node_modules/@bakarhythm/get-doc-content/dist/src/index.js",
        "/tmp/node_modules/.bin/get-doc-content",
        resolver,
      ),
    ).toBe(true);
  });

  it("returns false for unrelated cli paths", () => {
    expect(
      isCliEntrypoint(
        "file:///tmp/node_modules/@bakarhythm/get-doc-content/dist/src/index.js",
        "/tmp/other-script.js",
        (input) => input,
      ),
    ).toBe(false);
  });
});
