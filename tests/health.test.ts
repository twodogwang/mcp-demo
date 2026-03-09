import { describe, it, expect } from "vitest";
import { getServerMeta } from "../src/health";

describe("getServerMeta", () => {
  it("returns deterministic server metadata", () => {
    expect(getServerMeta()).toEqual({
      name: "ones-doc-mcp",
      version: "0.1.0",
    });
  });
});
