import { describe, expect, it } from "vitest";
import {
  resolveDebugPageArgs,
  formatDebugReport,
  parseDebugPageArgs,
} from "../scripts/debug-page";

describe("debug page script", () => {
  it("parses ref and raw char options", () => {
    expect(
      parseDebugPageArgs([
        "https://ones.example.internal/wiki/#/team/T/space/S/page/P",
        "--raw-chars",
        "300",
      ]),
    ).toEqual({
      ref: "https://ones.example.internal/wiki/#/team/T/space/S/page/P",
      rawChars: 300,
    });
  });

  it("parses full raw output option", () => {
    expect(parseDebugPageArgs(["table-page", "--raw-chars", "all"])).toEqual({
      ref: "table-page",
      rawChars: "all",
    });
    expect(parseDebugPageArgs(["table-page", "--full-raw"])).toEqual({
      ref: "table-page",
      rawChars: "all",
    });
  });

  it("uses default raw char limit", () => {
    expect(parseDebugPageArgs(["#12345"])).toEqual({
      ref: "#12345",
      rawChars: 1000,
    });
  });

  it("resolves default ref and raw chars from config", () => {
    expect(
      resolveDebugPageArgs([], {
        defaultRef: "table-page",
        rawChars: 1200,
        refs: {
          "table-page":
            "https://ones.example.internal/wiki/#/team/T/space/S/page/P",
        },
      }),
    ).toEqual({
      ref: "https://ones.example.internal/wiki/#/team/T/space/S/page/P",
      rawChars: 1200,
    });
  });

  it("resolves named ref from config and lets cli raw chars override config", () => {
    expect(
      resolveDebugPageArgs(["req", "--raw-chars", "300"], {
        defaultRef: "table-page",
        rawChars: 1200,
        refs: {
          "table-page":
            "https://ones.example.internal/wiki/#/team/T/space/S/page/P",
          req: "#12345",
        },
      }),
    ).toEqual({
      ref: "#12345",
      rawChars: 300,
    });
  });

  it("lets cli full raw option override config raw chars", () => {
    expect(
      resolveDebugPageArgs(["req", "--full-raw"], {
        defaultRef: "table-page",
        rawChars: 1200,
        refs: {
          "table-page":
            "https://ones.example.internal/wiki/#/team/T/space/S/page/P",
          req: "#12345",
        },
      }),
    ).toEqual({
      ref: "#12345",
      rawChars: "all",
    });
  });

  it("keeps direct cli refs without requiring config lookup", () => {
    expect(
      resolveDebugPageArgs(
        ["https://ones.example.internal/wiki/#/team/T/space/S/page/P"],
        {
          defaultRef: "req",
          rawChars: 1200,
          refs: {
            req: "#12345",
          },
        },
      ),
    ).toEqual({
      ref: "https://ones.example.internal/wiki/#/team/T/space/S/page/P",
      rawChars: 1200,
    });
  });

  it("formats a readable debug report", () => {
    const text = formatDebugReport(
      {
        kind: "page",
        teamId: "team-1",
        spaceId: "space-1",
        pageId: "page-1",
      },
      {
        doc: {
          id: "page-1",
          title: "示例页面",
          source_format: "html",
          updated_at: "2026-04-23T00:00:00Z",
        },
        markdown: "# 标题\n\n| 字段 | 规则 |\n| --- | --- |\n| 图片 | ![示意图](https://img.example/1.png) |",
        raw: {
          content: "<h1>标题</h1><table></table>",
        },
      },
      "all",
    );

    expect(text).toContain("source_format: html");
    expect(text).toContain("markdown_preview");
    expect(text).toContain("# 标题");
    expect(text).toContain("![示意图](https://img.example/1.png)");
    expect(text).toContain("raw_preview");
    expect(text).toContain("<h1>标题</h1>");
    expect(text).not.toContain("[truncated]");
  });
});
