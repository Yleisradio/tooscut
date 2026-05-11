export type TamsErrorCode =
  | "AUTH"
  | "NOT_FOUND"
  | "NETWORK"
  | "VALIDATION"
  | "EXPIRED_URL"
  | "SERVER_ERROR"
  | "UNKNOWN";

export class TamsError extends Error {
  constructor(
    public readonly code: TamsErrorCode,
    message: string,
    public readonly cause?: unknown,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "TamsError";
  }
}
