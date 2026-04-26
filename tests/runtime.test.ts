import { describe, expect, it, vi } from "vitest";

import { createRuntimeLoader } from "../src/services/runtime";

describe("runtime loader", () => {
  it("loads lazily and caches the same runtime instance", async () => {
    const runtime = { client: { searchDocs: vi.fn() } };
    const factory = vi.fn().mockResolvedValue(runtime);
    const getRuntime = createRuntimeLoader(factory as any);

    expect(factory).not.toHaveBeenCalled();

    const first = await getRuntime();
    const second = await getRuntime();

    expect(first).toBe(runtime);
    expect(second).toBe(runtime);
    expect(factory).toHaveBeenCalledTimes(1);
  });
});
