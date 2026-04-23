import { describe, expect, it } from "vitest";
import { detectDocumentSource } from "../../src/documents/source";

describe("detectDocumentSource", () => {
  it("detects html source from content string", () => {
    expect(
      detectDocumentSource({ content: "<table><tr><td>A</td></tr></table>" }).format,
    ).toBe("html");
  });

  it("detects richtext-json source from blocks payload", () => {
    expect(
      detectDocumentSource({
        content: JSON.stringify({
          blocks: [{ type: "text", text: [{ insert: "A" }] }],
        }),
      }).format,
    ).toBe("richtext-json");
  });
});
