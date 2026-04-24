import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("treats text blocks with heading as heading nodes", () => {
    const doc = parseRichTextDocument(
      JSON.stringify({
        blocks: [{ type: "text", heading: 3, text: [{ insert: "三级标题" }] }],
      }),
    );

    expect(doc.children).toEqual([
      {
        type: "heading",
        level: 3,
        children: [{ type: "text", value: "三级标题" }],
        path: "root/0",
      },
    ]);
  });

  it("parses table cells from payload slots and keeps span info", () => {
    const doc = parseRichTextDocument(
      JSON.stringify({
        blocks: [
          {
            type: "table",
            rows: 2,
            cols: 2,
            children: ["cell-a", "cell-b", "cell-c"],
            "cell-a_rowSpan": 2,
            "cell-a_colSpan": 1,
          },
        ],
        "cell-a": [{ type: "text", text: [{ insert: "合并行" }] }],
        "cell-b": [{ type: "text", text: [{ insert: "第一行第二列" }] }],
        "cell-c": [{ type: "text", text: [{ insert: "第二行第二列" }] }],
      }),
    );

    expect(doc.children).toEqual([
      {
        type: "table",
        path: "root/0",
        rows: [
          {
            cells: [
              {
                colspan: 1,
                rowspan: 2,
                children: [
                  {
                    type: "paragraph",
                    children: [{ type: "text", value: "合并行" }],
                    path: "root/0/r0/c0/0",
                  },
                ],
              },
              {
                colspan: 1,
                rowspan: 1,
                children: [
                  {
                    type: "paragraph",
                    children: [{ type: "text", value: "第一行第二列" }],
                    path: "root/0/r0/c1/0",
                  },
                ],
              },
            ],
          },
          {
            cells: [
              {
                colspan: 1,
                rowspan: 1,
                children: [
                  {
                    type: "paragraph",
                    children: [{ type: "text", value: "第二行第二列" }],
                    path: "root/0/r1/c1/0",
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);
  });

  it("maps embed blocks into image resources", () => {
    const doc = parseRichTextDocument(
      JSON.stringify({
        blocks: [
          {
            type: "embed",
            embedType: "drawio",
            embedData: { src: "https://img.example/flow.svg" },
          },
          {
            type: "embed",
            embedType: "xmind",
            embedData: { thumbnail: "https://img.example/map.png" },
          },
        ],
      }),
    );

    expect(doc.children).toEqual([
      { type: "image", resourceRef: "res-image-0", path: "root/0" },
      { type: "image", resourceRef: "res-image-1", path: "root/1" },
    ]);
    expect(doc.resources).toEqual([
      {
        id: "res-image-0",
        type: "embed",
        embedType: "drawio",
        src: "https://img.example/flow.svg",
        alt: "drawio",
      },
      {
        id: "res-image-1",
        type: "embed",
        embedType: "xmind",
        src: "https://img.example/map.png",
        alt: "xmind",
      },
    ]);
  });

  it("keeps list text instead of dropping it", () => {
    const doc = parseRichTextDocument(
      JSON.stringify({
        blocks: [
          { type: "list", ordered: false, level: 1, text: [{ insert: "无序项" }] },
          { type: "list", ordered: true, start: 3, level: 1, text: [{ insert: "有序项" }] },
        ],
      }),
    );

    expect(doc.children).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "- 无序项" }],
        path: "root/0",
      },
      {
        type: "paragraph",
        children: [{ type: "text", value: "3. 有序项" }],
        path: "root/1",
      },
    ]);
  });

  it("parses a real-page-like richtext fixture into mixed node types", () => {
    const raw = readFileSync(
      resolve(process.cwd(), "tests/fixtures/richtext-page-like.json"),
      "utf8",
    );

    const doc = parseRichTextDocument(raw);

    expect(doc.children.map((node) => node.type)).toEqual([
      "heading",
      "table",
      "image",
      "paragraph",
    ]);
    expect(doc.resources).toEqual([
      {
        id: "res-image-0",
        type: "embed",
        embedType: "drawio",
        src: "https://img.example/flow.svg",
        alt: "drawio",
      },
    ]);
  });
});
