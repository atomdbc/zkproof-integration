export type StarkCircomErrorCode =
  | "INVALID_ARTIFACT"
  | "INVALID_INPUT"
  | "INVALID_MANIFEST"
  | "UNSUPPORTED_CURVE"
  | "CALLDATA_GENERATION_FAILED"
  | "STARKNET_CALL_FAILED"
  | "MALFORMED_VERIFIER_RESPONSE";

export class StarkCircomError extends Error {
  readonly code: StarkCircomErrorCode;
  readonly cause?: unknown;

  constructor(code: StarkCircomErrorCode, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "StarkCircomError";
    this.code = code;
    this.cause = options?.cause;
  }
}
