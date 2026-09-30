export type ErrorCode =
  | "INVALID_INPUT"
  | "AUTH_FAILED"
  | "NOT_FOUND"
  | "UPSTREAM_ERROR"
  | "RESOURCE_DOWNLOAD_FAILED"
  | "INVALID_DOC_REF"
  | "CONFIG_ERROR"
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
