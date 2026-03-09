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
