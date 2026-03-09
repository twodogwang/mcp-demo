export type ErrorCode =
  | "AUTH_FAILED"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "INVALID_DOC_REF"
  | "NO_LINKED_DOC"
  | "DISCOVERY_FAILED";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AppError";
  }
}
