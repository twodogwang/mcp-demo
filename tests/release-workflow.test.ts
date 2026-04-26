import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  new URL("../.github/workflows/publish-npm.yml", import.meta.url),
  "utf8",
);

describe("publish workflow", () => {
  it("runs on pushes to main instead of tag pushes", () => {
    expect(workflow).toContain("branches:");
    expect(workflow).toContain('- "main"');
    expect(workflow).not.toContain("tags:");
  });

  it("uses changesets action to manage release prs and publishing", () => {
    expect(workflow).toContain("changesets/action@v1");
    expect(workflow).toContain("version-packages");
    expect(workflow).toContain("release");
  });

  it("keeps the permissions needed for release prs and trusted publishing", () => {
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("pull-requests: write");
    expect(workflow).toContain("id-token: write");
  });
});
