import { expect, it } from "vitest";
import { redactSecrets } from "../src/logger";

it("redacts cookie and password fields", () => {
  const line = redactSecrets("cookie=sid=abc; password=123456");
  expect(line).toContain("cookie=[REDACTED]");
  expect(line).toContain("password=[REDACTED]");
});
