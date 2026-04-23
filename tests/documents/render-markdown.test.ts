import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/documents/render-markdown";

describe("renderMarkdown", () => {
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
