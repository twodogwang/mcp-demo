import { describe, expect, it } from "vitest";

import type { DocMetadata, ParsedDocument } from "../../src/documents/model";
import { buildDocumentChunks, getChunkSlice, parseChunkCursor } from "../../src/documents/chunks";
import { buildDocumentOutline } from "../../src/documents/outline";

const docMeta: DocMetadata = {
  id: "D-1",
  title: "权限文档",
  source_format: "html",
  updated_at: "2026-04-26T00:00:00Z",
};

describe("buildDocumentChunks", () => {
  it("groups contiguous sections into cursor-based chunks", () => {
    const parsed: ParsedDocument = {
      children: [
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", value: "第一章" }],
          path: "root/0",
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "A".repeat(30) }],
          path: "root/1",
        },
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", value: "第二章" }],
          path: "root/2",
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "B".repeat(30) }],
          path: "root/3",
        },
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", value: "第三章" }],
          path: "root/4",
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "C".repeat(30) }],
          path: "root/5",
        },
      ],
      resources: [],
    };

    const outline = buildDocumentOutline(docMeta, parsed);
    const chunks = buildDocumentChunks(outline, 80);

    expect(chunks).toMatchObject([
      {
        cursor: "chunk-0",
        index: 0,
        section_ids: ["sec-1", "sec-2"],
      },
      {
        cursor: "chunk-1",
        index: 1,
        section_ids: ["sec-3"],
      },
    ]);
    expect(parseChunkCursor("chunk-1")).toBe(1);
  });

  it("returns the parsed document slice for one chunk", () => {
    const parsed: ParsedDocument = {
      children: [
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", value: "第一章" }],
          path: "root/0",
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "A".repeat(30) }],
          path: "root/1",
        },
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", value: "第二章" }],
          path: "root/2",
        },
        {
          type: "paragraph",
          children: [{ type: "text", value: "B".repeat(30) }],
          path: "root/3",
        },
      ],
      resources: [],
    };

    const outline = buildDocumentOutline(docMeta, parsed);
    const [firstChunk] = buildDocumentChunks(outline, 40);
    if (!firstChunk) {
      throw new Error("expected first chunk");
    }

    const slice = getChunkSlice(parsed, firstChunk);

    expect(slice.children).toHaveLength(2);
    expect(slice.children[0]).toMatchObject({
      type: "heading",
      children: [{ value: "第一章" }],
    });
  });
});
