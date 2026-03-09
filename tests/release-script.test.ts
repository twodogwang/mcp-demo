import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("release scripts", () => {
  it("defines bumpp local release scripts", () => {
    expect(pkg.scripts).toHaveProperty("release:patch");
    expect(pkg.scripts).toHaveProperty("release:minor");
    expect(pkg.scripts).toHaveProperty("release:major");
  });
});
