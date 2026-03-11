import { describe, expect, it } from "vitest";
import { parseRef } from "../src/ref-parser";

describe("parseRef", () => {
  it("parses ones url as doc ref", () => {
    const out = parseRef(
      "https://ones.example.internal/wiki/#/doc/abc123",
      "ones.example.internal",
    );
    expect(out).toEqual({ kind: "doc", docId: "abc123" });
  });

  it("parses wiki page url as page ref", () => {
    const out = parseRef(
      "https://1s.oristand.com/wiki/#/team/63FL1oSZ/space/JhN6fj4M/page/9Pkrzqbf",
      "1s.oristand.com",
    );
    expect(out).toEqual({
      kind: "page",
      teamId: "63FL1oSZ",
      pageId: "9Pkrzqbf",
      spaceId: "JhN6fj4M",
    });
  });

  it("parses #12345 as requirement ref", () => {
    const out = parseRef("#12345", "ones.example.internal");
    expect(out).toEqual({ kind: "requirement", requirementId: "12345" });
  });

  it("throws on invalid ref", () => {
    expect(() => parseRef("not-a-ref", "ones.example.internal")).toThrow(
      "INVALID_DOC_REF",
    );
  });
});
