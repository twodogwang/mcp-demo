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
});
