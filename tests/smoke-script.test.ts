import { describe, expect, it } from "vitest";
import { buildGetDocSmokeCommand, buildSmokeCommand } from "../scripts/smoke";

describe("smoke command", () => {
  it("builds search_docs invocation command", () => {
    expect(buildSmokeCommand("ONES")).toContain("search_docs");
  });

  it("builds get_doc command with ref", () => {
    const text = buildGetDocSmokeCommand(
      "https://ones.example.internal/wiki/#/doc/abc",
    );
    expect(text).toContain("\"get_doc\"");
    expect(text).toContain("\"ref\"");
  });
});
