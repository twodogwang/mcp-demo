import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("package metadata", () => {
  it("is installable CLI package", () => {
    expect(pkg.name).toBe("@bakarhythm/get-doc-content");
    expect(pkg.bin).toHaveProperty("get-doc-content", "dist/src/index.js");
    expect(pkg.main).toBe("dist/src/index.js");
    expect(pkg.publishConfig?.access).toBe("public");
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/twodogwang/mcp-demo.git",
    });
    expect(pkg.homepage).toBe("https://github.com/twodogwang/mcp-demo#readme");
    expect(pkg.bugs).toEqual({
      url: "https://github.com/twodogwang/mcp-demo/issues",
    });
  });
});
