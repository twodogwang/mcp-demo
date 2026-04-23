import { describe, expect, it } from "vitest";
import { parseRichTextDocument } from "../../src/documents/parse-rich-text";

describe("parseRichTextDocument", () => {
  it("returns empty document when raw is invalid json", () => {
    const doc = parseRichTextDocument("{not-valid-json");

    expect(doc).toEqual({
      children: [],
      resources: [],
    });
  });

  it("returns empty document when blocks is not an array", () => {
    const doc = parseRichTextDocument(
      JSON.stringify({
        blocks: "not-array",
      }),
    );

    expect(doc).toEqual({
      children: [],
      resources: [],
    });
  });

  it("parses heading level from string", () => {
    const doc = parseRichTextDocument(
      JSON.stringify({
        blocks: [{ type: "heading", level: "2", text: [{ insert: "二级标题" }] }],
      }),
    );

    expect(doc.children).toEqual([
      {
        type: "heading",
        level: 2,
        children: [{ type: "text", value: "二级标题" }],
        path: "root/0",
      },
    ]);
  });

  it("maps rich-text blocks into headings, paragraphs, and images", () => {
    const doc = parseRichTextDocument(
      JSON.stringify({
        blocks: [
          { type: "heading", level: 1, text: [{ insert: "标题" }] },
          { type: "text", text: [{ insert: "正文" }] },
          { type: "image", attrs: { src: "https://img.example/2.png", alt: "示意图" } },
        ],
      }),
    );

    expect(doc.children.map((node) => node.type)).toEqual(["heading", "paragraph", "image"]);
    expect(doc.children[0]).toEqual({
      type: "heading",
      level: 1,
      children: [{ type: "text", value: "标题" }],
      path: "root/0",
    });
    expect(doc.children[1]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "正文" }],
      path: "root/1",
    });
    expect(doc.children[2]).toEqual({
      type: "image",
      resourceRef: "res-image-0",
      path: "root/2",
    });
    expect(doc.resources).toEqual([
      {
        id: "res-image-0",
        type: "image",
        src: "https://img.example/2.png",
        alt: "示意图",
      },
    ]);
  });
});
