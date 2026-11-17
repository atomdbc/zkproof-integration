import { StarkCircomError } from "./errors.js";
import type { Groth16VerificationKey, PublicSignals, SupportedCurve } from "./types.js";

export const BN254_SCALAR_FIELD =
  21_888_242_871_839_275_222_246_405_745_257_275_088_548_364_400_416_034_343_698_204_186_575_808_495_617n;

export function toBigInt(value: string | number | bigint, label = "value"): bigint {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0)) {
    throw new StarkCircomError(
      "INVALID_INPUT",
      `${label} must be a non-negative safe integer, bigint, decimal string, or hexadecimal string.`,
    );
  }

  try {
    const result = BigInt(value);
    if (result < 0n) throw new Error("negative");
    return result;
  } catch (cause) {
    throw new StarkCircomError(
      "INVALID_INPUT",
      `${label} is not a valid non-negative integer.`,
      { cause },
    );
  }
}

export function assertGroth16VerificationKey(
  value: unknown,
): asserts value is Groth16VerificationKey {
  if (!value || typeof value !== "object") {
    throw new StarkCircomError("INVALID_ARTIFACT", "The verification key must be a JSON object.");
  }

  const key = value as Record<string, unknown>;
  if (key.protocol !== "groth16") {
    throw new StarkCircomError("INVALID_ARTIFACT", "Only Groth16 verification keys are supported.");
  }
  if (key.curve !== "bn128" && key.curve !== "bn254") {
    throw new StarkCircomError(
      "UNSUPPORTED_CURVE",
      `Unsupported verification-key curve ${String(key.curve)}. Circom Groth16 currently requires BN254.`,
    );
  }
  if (!Number.isInteger(key.nPublic) || Number(key.nPublic) < 0) {
    throw new StarkCircomError("INVALID_ARTIFACT", "The verification key has an invalid nPublic value.");
  }
}

export function curveFromVerificationKey(key: Groth16VerificationKey): SupportedCurve {
  assertGroth16VerificationKey(key);
  return "bn254";
}

export function validatePublicSignals(
  publicSignals: PublicSignals,
  expectedCount?: number,
): bigint[] {
  if (!Array.isArray(publicSignals)) {
    throw new StarkCircomError("INVALID_INPUT", "Public signals must be an array.");
  }
  if (expectedCount !== undefined && publicSignals.length !== expectedCount) {
    throw new StarkCircomError(
      "INVALID_INPUT",
      `Expected ${expectedCount} public signals but received ${publicSignals.length}.`,
    );
  }

  return publicSignals.map((value, index) => {
    const signal = toBigInt(value, `publicSignals[${index}]`);
    if (signal >= BN254_SCALAR_FIELD) {
      throw new StarkCircomError(
        "INVALID_INPUT",
        `publicSignals[${index}] is outside the BN254 scalar field.`,
      );
    }
    return signal;
  });
}
