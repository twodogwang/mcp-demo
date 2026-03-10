import { afterEach, describe, expect, it, vi } from "vitest";

import { logInfo } from "../src/logger";

describe("logger stream safety", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes info logs to stderr instead of stdout", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    logInfo("ones.request", { path: "/api/wiki/search" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
