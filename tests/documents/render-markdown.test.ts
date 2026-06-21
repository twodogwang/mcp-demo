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

  it("pads table rows when column counts are inconsistent", () => {
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

    expect(markdown).toBe("| 列1 | 列2 |\n| --- | --- |\n| 只剩一列 |  |");
    expect(markdown).not.toContain("[复杂表格");
  });

  it("renders table with colspan merged header", () => {
    const markdown = renderMarkdown({
      children: [
        {
          type: "table",
          rows: [
            {
              cells: [
                {
                  colspan: 2,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "页面元素" }], path: "0/0" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "说明" }], path: "0/1" }],
                },
              ],
            },
            {
              cells: [
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "按钮" }], path: "1/0" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "申请" }], path: "1/1" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "提交审批" }], path: "1/2" }],
                },
              ],
            },
          ],
          path: "merged-table",
        },
      ],
      resources: [],
    });

    expect(markdown).toBe("| 页面元素 |  | 说明 |\n| --- | --- | --- |\n| 按钮 | 申请 | 提交审批 |");
    expect(markdown).not.toContain("[复杂表格");
  });

  it("renders cell with multiple paragraphs", () => {
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
                  children: [{ type: "paragraph", children: [{ type: "text", value: "字段" }], path: "0/0" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "规则" }], path: "0/1" }],
                },
              ],
            },
            {
              cells: [
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "申请原因" }], path: "1/0" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [
                    { type: "paragraph", children: [{ type: "text", value: "必填" }], path: "1/1/0" },
                    { type: "paragraph", children: [{ type: "text", value: "最多 200 字" }], path: "1/1/1" },
                  ],
                },
              ],
            },
          ],
          path: "multi-paragraph-table",
        },
      ],
      resources: [],
    });

    expect(markdown).toContain("必填<br>最多 200 字");
    expect(markdown).not.toContain("[复杂表格");
  });

  it("lifts nested tables into referenced child tables", () => {
    const markdown = renderMarkdown({
      children: [
        {
          type: "heading",
          level: 2,
          children: [{ type: "text", value: "2.1.1 申请页" }],
          path: "0",
        },
        {
          type: "table",
          rows: [
            {
              cells: [
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "字段" }], path: "1/0/0" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "规则" }], path: "1/0/1" }],
                },
              ],
            },
            {
              cells: [
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [{ type: "paragraph", children: [{ type: "text", value: "退款路径" }], path: "1/1/0" }],
                },
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [
                    {
                      type: "table",
                      rows: [
                        {
                          cells: [
                            {
                              colspan: 1,
                              rowspan: 1,
                              children: [{ type: "paragraph", children: [{ type: "text", value: "渠道" }], path: "1/1/1/0/0" }],
                            },
                            {
                              colspan: 1,
                              rowspan: 1,
                              children: [{ type: "paragraph", children: [{ type: "text", value: "原路退回" }], path: "1/1/1/0/1" }],
                            },
                          ],
                        },
                        {
                          cells: [
                            {
                              colspan: 1,
                              rowspan: 1,
                              children: [{ type: "paragraph", children: [{ type: "text", value: "电汇" }], path: "1/1/1/1/0" }],
                            },
                            {
                              colspan: 1,
                              rowspan: 1,
                              children: [
                                { type: "paragraph", children: [{ type: "text", value: "是" }], path: "1/1/1/1/1/0" },
                                { type: "image", resourceRef: "res-image-0", path: "1/1/1/1/1/1" },
                              ],
                            },
                          ],
                        },
                      ],
                      path: "1/1/1",
                    },
                  ],
                },
              ],
            },
          ],
          path: "1",
        },
      ],
      resources: [{ id: "res-image-0", type: "image", src: "https://ones.example/resource.png", alt: "电汇账号截图" }],
    });

    expect(markdown).toContain("| 退款路径 | [见子表 1] |");
    expect(markdown).toContain("子表 1:");
    expect(markdown).toContain("| 渠道 | 原路退回 |");
    expect(markdown).toContain("| 电汇 | 是<br>![电汇账号截图](https://ones.example/resource.png) |");
    expect(markdown).not.toContain("[复杂结构");
    expect(markdown).not.toContain("[复杂表格");
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
