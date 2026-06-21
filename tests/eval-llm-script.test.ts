import { describe, expect, it } from "vitest";
import type { DocDetail } from "../src/documents/model";
import {
  buildEvalInput,
  parseEvalArgs,
  resolveEvalRef,
  scoreEvalResult,
} from "../scripts/eval-llm";

const detail: DocDetail = {
  doc: {
    id: "D-1",
    title: "示例文档",
    source_format: "html",
    updated_at: "2026-04-23T00:00:00Z",
  },
  markdown: "支持增量同步\n\n![示意图](https://img.example/1.png)",
  raw: {
    content: "<p>支持增量同步</p>",
  },
};

describe("eval llm script", () => {
  it("parses variant and case filters", () => {
    expect(
      parseEvalArgs(["--variant", "raw", "--case", "table", "--case", "image"]),
    ).toEqual({
      configPath: "llm-eval.config.json",
      variant: "raw",
      cases: ["table", "image"],
    });
  });

  it("uses default config path with no args", () => {
    expect(parseEvalArgs([])).toEqual({
      configPath: "llm-eval.config.json",
      variant: undefined,
      cases: [],
    });
  });

  it("resolves direct refs and named refs", () => {
    expect(
      resolveEvalRef("page-a", {
        "page-a": "https://ones.example.internal/wiki/#/team/T/space/S/page/P",
      }),
    ).toBe("https://ones.example.internal/wiki/#/team/T/space/S/page/P");
    expect(resolveEvalRef("#12345", {})).toBe("#12345");
  });

  it("builds markdown, raw and full inputs", () => {
    expect(buildEvalInput(detail, "markdown")).toContain("\"markdown\"");
    expect(buildEvalInput(detail, "markdown")).not.toContain("\"raw\"");
    expect(buildEvalInput(detail, "raw")).toContain("<p>支持增量同步</p>");
    expect(buildEvalInput(detail, "full")).toContain("\"doc\"");
    expect(buildEvalInput(detail, "full")).toContain("\"raw\"");
  });

  it("scores required and forbidden phrases", () => {
    expect(
      scoreEvalResult(
        {
          answer: "需求支持增量同步",
          evidence: ["root/0"],
        },
        {
          requiredPhrases: ["增量同步"],
          forbiddenPhrases: ["全量覆盖"],
        },
      ),
    ).toEqual({
      pass: true,
      missingRequired: [],
      matchedRequired: ["增量同步"],
      matchedForbidden: [],
    });

    expect(
      scoreEvalResult(
        {
          answer: "需求是全量覆盖",
          evidence: [],
        },
        {
          requiredPhrases: ["增量同步"],
          forbiddenPhrases: ["全量覆盖"],
        },
      ),
    ).toEqual({
      pass: false,
      missingRequired: ["增量同步"],
      matchedRequired: [],
      matchedForbidden: ["全量覆盖"],
    });
  });
});
