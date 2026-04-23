import { describe, expect, it } from "vitest";
import { buildToolList } from "../src/index";

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

  it("get_doc accepts view/include_raw/include_resources and defaults to llm", () => {
    const getDoc = buildToolList().find((t) => t.name === "get_doc");
    const schema = getDoc?.inputSchema as {
      properties?: Record<string, { enum?: string[]; default?: unknown }>;
      required?: string[];
    };

    expect(schema.required).toEqual(["ref"]);
    expect(schema.properties?.view?.enum).toEqual(["llm", "human", "both"]);
    expect(schema.properties?.view?.default).toBe("llm");
    expect(schema.properties?.include_raw?.default).toBe(false);
    expect(schema.properties?.include_resources?.default).toBe(true);
  });
});
