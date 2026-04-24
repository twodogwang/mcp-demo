import { afterEach, describe, expect, it, vi } from "vitest";

import { AppError } from "../src/errors";
import { logInfo, serializeError } from "../src/logger";

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

  it("serializes app errors with code and status", () => {
    const error = new AppError("AUTH_FAILED", "bad password", 401);

    expect(serializeError(error)).toMatchObject({
      errorName: "AppError",
      errorMessage: "bad password",
      errorCode: "AUTH_FAILED",
      errorStatus: 401,
    });
  });
});
