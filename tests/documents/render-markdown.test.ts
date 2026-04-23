import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/documents/render-markdown";

describe("renderMarkdown", () => {
  it("renders a simple table", () => {
    const markdown = renderMarkdown({
      children: [
        {
          type: "table",
          rows: [
            {
              cells: [
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "列1" }], path: "0/0" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "列2" }], path: "0/1" }],
                },
              ],
            },
            {
              cells: [
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "值1" }], path: "1/0" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "值2" }], path: "1/1" }],
                },
              ],
            },
          ],
          path: "0",
        },
      ],
      resources: [],
    });

    expect(markdown).toBe("| 列1 | 列2 |\n| --- | --- |\n| 值1 | 值2 |");
  });

  it("degrades table when column counts are inconsistent", () => {
    const markdown = renderMarkdown({
      children: [
        {
          type: "table",
          rows: [
            {
              cells: [
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "列1" }], path: "0/0" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "列2" }], path: "0/1" }],
                },
              ],
            },
            {
              cells: [
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "只剩一列" }], path: "1/0" }],
                },
              ],
            },
          ],
          path: "broken-table",
        },
      ],
      resources: [],
    });

    expect(markdown).toBe("[复杂表格，详见原文（broken-table）]");
  });

  it("renders image resource as markdown", () => {
    const markdown = renderMarkdown({
      children: [{ type: "image", resourceRef: "res-image-0", path: "0" }],
      resources: [{ id: "res-image-0", type: "image", src: "https://img.example/1.png", alt: "示意图" }],
    });

    expect(markdown).toBe("![示意图](https://img.example/1.png)");
  });

  it("renders simple ast to markdown and degrades complex tables", () => {
    const markdown = renderMarkdown({
      children: [
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", value: "标题" }],
          path: "0",
        },
        { type: "table", rows: [], path: "1" },
      ],
      resources: [],
    });

    expect(markdown).toContain("# 标题");
    expect(markdown).toContain("[复杂表格");
  });
});
