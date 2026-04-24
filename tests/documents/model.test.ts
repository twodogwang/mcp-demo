import { describe, expect, it } from "vitest";
import { toGetDocOptions } from "../../src/documents/model";

describe("toGetDocOptions", () => {
  it("converts snake_case tool input to internal camelCase options", () => {
    const options = toGetDocOptions({
      view: "both",
      include_raw: true,
      include_resources: false,
    });

    expect(options).toEqual({
      view: "both",
      includeRaw: true,
      includeResources: false,
    });
  });
});
