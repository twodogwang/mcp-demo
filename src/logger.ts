function tryGetBaseUrlHost(): string | null {
  const baseUrl = process.env.ONES_BASE_URL;
  if (!baseUrl || baseUrl.trim() === "") {
    return null;
  }

  try {
    return new URL(baseUrl).host;
  } catch {
    return "[invalid-url]";
  }
}

export function redactSecrets(input: string): string {
  return input
    .replace(/cookie=[^;\s]+/gi, "cookie=[REDACTED]")
    .replace(/password=[^;\s]+/gi, "password=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [REDACTED]");
}

export function getRuntimeEnvMeta(): Record<string, unknown> {
  return {
    pid: process.pid,
    nodeVersion: process.version,
    argv1: process.argv[1] ?? null,
    cwd: process.cwd(),
    env: {
      hasBaseUrl: Boolean(process.env.ONES_BASE_URL?.trim()),
      hasUsername: Boolean(process.env.ONES_USERNAME?.trim()),
      hasPassword: Boolean(process.env.ONES_PASSWORD?.trim()),
      baseUrlHost: tryGetBaseUrlHost(),
    },
  };
}

export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const candidate = error as Error & {
      code?: unknown;
      status?: unknown;
      cause?: unknown;
    };

    return {
      errorName: candidate.name,
      errorMessage: redactSecrets(candidate.message),
      errorCode: candidate.code ?? null,
      errorStatus: candidate.status ?? null,
      errorStack: candidate.stack ? redactSecrets(candidate.stack) : null,
      errorCause:
        candidate.cause instanceof Error
          ? redactSecrets(candidate.cause.message)
          : candidate.cause ?? null,
    };
  }

  return {
    errorName: "NonErrorThrown",
    errorMessage: redactSecrets(String(error)),
    errorCode: null,
    errorStatus: null,
    errorStack: null,
    errorCause: null,
  };
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
