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
  llm_view: {
    type: "document",
    source_format: "html",
    children: [
      {
        type: "paragraph",
        children: [{ type: "text", value: "支持增量同步" }],
        path: "root/0",
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
  },
  human_view: {
    format: "markdown",
    content: "支持增量同步",
  },
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

  it("builds llm_view, raw and full inputs", () => {
    expect(buildEvalInput(detail, "llm_view")).toContain("\"llm_view\"");
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
