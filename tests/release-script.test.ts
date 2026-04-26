import { describe, expect, it } from "vitest";
import pkg from "../package.json";

describe("release scripts", () => {
  it("defines changesets release scripts", () => {
    expect(pkg.scripts).toHaveProperty("changeset");
    expect(pkg.scripts).toHaveProperty("version-packages");
    expect(pkg.scripts).toHaveProperty("release");
  });

  it("does not rely on bumpp local tag release scripts anymore", () => {
    expect(pkg.scripts).not.toHaveProperty("release:patch");
    expect(pkg.scripts).not.toHaveProperty("release:minor");
    expect(pkg.scripts).not.toHaveProperty("release:major");
  });
});
