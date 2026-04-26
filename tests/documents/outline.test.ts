import { describe, expect, it } from "vitest";

import type { DocMetadata, ParsedDocument } from "../../src/documents/model";
import {
  buildDocumentOutline,
  getSectionSlice,
} from "../../src/documents/outline";

const docMeta: DocMetadata = {
  id: "D-1",
  title: "权限文档",
  source_format: "richtext-json",
  updated_at: "2026-04-26T00:00:00Z",
};

describe("buildDocumentOutline", () => {
  it("builds hierarchical non-overlapping sections from heading nodes", () => {
    const parsed: ParsedDocument = {
      children: [
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", value: "需求背景" }],
          path: "root/0",
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "这里是背景说明" }],
          path: "root/1",
        },
        {
          type: "heading",
          level: 2,
          children: [{ type: "text", value: "权限规则" }],
          path: "root/2",
        },
        {
          type: "table",
          rows: [
            {
              cells: [
                {
                  colspan: 1,
                  rowspan: 1,
                  children: [
                    {
                      type: "paragraph",
                      children: [{ type: "text", value: "角色" }],
                      path: "root/3/r0/c0/0",
                    },
                  ],
                },
              ],
            },
          ],
          path: "root/3",
        },
        {
          type: "image",
          resourceRef: "res-image-0",
          path: "root/4",
        },
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", value: "附录" }],
          path: "root/5",
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "补充说明" }],
          path: "root/6",
        },
      ],
      resources: [
        {
          id: "res-image-0",
          type: "image",
          src: "https://img.example/1.png",
          alt: "示意图",
        },
      ],
    };

    const outline = buildDocumentOutline(docMeta, parsed);

    expect(outline.doc).toEqual(docMeta);
    expect(outline.section_count).toBe(3);
    expect(outline.sections).toMatchObject([
      {
        id: "sec-1",
        path: "1",
        title: "需求背景",
        level: 1,
        table_count: 0,
        image_count: 0,
      },
      {
        id: "sec-2",
        path: "1.1",
        title: "权限规则",
        level: 2,
        table_count: 1,
        image_count: 1,
      },
      {
        id: "sec-3",
        path: "2",
        title: "附录",
        level: 1,
        table_count: 0,
        image_count: 0,
      },
    ]);

    expect(outline.sections[0]?.estimated_chars).toBeGreaterThan(0);
    expect(outline.sections[1]?.estimated_chars).toBeGreaterThan(0);
  });

  it("creates a synthetic root section when the document has no headings", () => {
    const parsed: ParsedDocument = {
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", value: "只有正文，没有标题" }],
          path: "root/0",
        },
      ],
      resources: [],
    };

    const outline = buildDocumentOutline(docMeta, parsed);

    expect(outline.section_count).toBe(1);
    expect(outline.sections).toMatchObject([
      {
        id: "sec-1",
        path: "1",
        title: "权限文档",
        level: 0,
      },
    ]);
  });
});

describe("getSectionSlice", () => {
  it("returns descendant content when includeDescendants is true", () => {
    const parsed: ParsedDocument = {
      children: [
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", value: "需求背景" }],
          path: "root/0",
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "背景" }],
          path: "root/1",
        },
        {
          type: "heading",
          level: 2,
          children: [{ type: "text", value: "权限规则" }],
          path: "root/2",
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "规则详情" }],
          path: "root/3",
        },
      ],
      resources: [],
    };

    const outline = buildDocumentOutline(docMeta, parsed);
    const section = getSectionSlice(parsed, outline, "sec-1", true);

    expect(section.children).toHaveLength(4);
    expect(section.children[2]).toMatchObject({
      type: "heading",
      children: [{ value: "权限规则" }],
    });
  });
});
