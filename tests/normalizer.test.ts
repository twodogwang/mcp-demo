import { describe, expect, it } from "vitest";
import { normalizeContent } from "../src/normalizer";

describe("normalizeContent", () => {
  it("strips html and truncates by max chars", () => {
    const input = "<h1>Title</h1><p>Hello <b>World</b></p>";
    const out = normalizeContent(input, 12);
    expect(out).toBe("Title Hello");
  });
});
