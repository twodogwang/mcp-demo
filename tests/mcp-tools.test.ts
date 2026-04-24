import { afterEach, describe, expect, it } from "vitest";
import {
  buildToolList,
  createServer,
  isCliEntrypoint,
  parseGetDocInput,
} from "../src/index";

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
      properties?: Record<string, { minLength?: number }>;
    };

    expect(schema.required).toEqual(["ref"]);
    expect(schema.properties?.ref?.minLength).toBe(1);
  });

  it("get_doc accepts view/include_raw/include_resources and defaults to llm", () => {
    const getDoc = buildToolList().find((t) => t.name === "get_doc");
    const schema = getDoc?.inputSchema as {
      properties?: Record<
        string,
        { type?: string; enum?: string[]; default?: unknown }
      >;
      required?: string[];
    };

    expect(schema.required).toEqual(["ref"]);
    expect(getDoc?.description).toContain("llm/human structured views");
    expect(schema.properties?.view?.enum).toEqual(["llm", "human", "both"]);
    expect(schema.properties?.view?.default).toBe("llm");
    expect(schema.properties).toHaveProperty("include_raw");
    expect(schema.properties?.include_raw?.type).toBe("boolean");
    expect(schema.properties?.include_raw?.default).toBe(false);
    expect(schema.properties).toHaveProperty("include_resources");
    expect(schema.properties?.include_resources?.type).toBe("boolean");
    expect(schema.properties?.include_resources?.default).toBe(true);
  });

  it("parses get_doc runtime args with defaults and validates option types", () => {
    const withDefaults = parseGetDocInput({ ref: "#12345" });
    expect(withDefaults).toEqual({
      ref: "#12345",
      view: "llm",
      include_raw: false,
      include_resources: true,
    });

    const withExplicitOptions = parseGetDocInput({
      ref: "#12345",
      view: "both",
      include_raw: true,
      include_resources: false,
    });
    expect(withExplicitOptions).toEqual({
      ref: "#12345",
      view: "both",
      include_raw: true,
      include_resources: false,
    });

    expect(() =>
      parseGetDocInput({
        ref: "#12345",
        include_raw: "true",
      }),
    ).toThrow();
    expect(() => parseGetDocInput({ ref: "" })).toThrow();
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
