export function redactSecrets(input: string): string {
  return input
    .replace(/cookie=[^;\s]+/gi, "cookie=[REDACTED]")
    .replace(/password=[^;\s]+/gi, "password=[REDACTED]");
}

export function logInfo(message: string, meta: Record<string, unknown> = {}): void {
  const serialized = JSON.stringify(meta);
  // MCP stdio transport reserves stdout for protocol frames only.
  console.error(redactSecrets(`${message} ${serialized}`));
}

export function logError(message: string, meta: Record<string, unknown> = {}): void {
  const serialized = JSON.stringify(meta);
  console.error(redactSecrets(`${message} ${serialized}`));
}
