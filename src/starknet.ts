import type { BlockIdentifier, Call } from "starknet";
import { validateAndParseAddress } from "starknet";
import { StarkCircomError } from "./errors.js";
import type { StarknetPreparedProof, SupportedCurve } from "./types.js";
import { toBigInt } from "./validation.js";

export interface StarknetCallProvider {
  callContract(call: Call, blockIdentifier?: BlockIdentifier): Promise<string[]>;
}

export type GaragaVerifierResult =
  | { valid: true; publicSignals: bigint[]; raw: string[] }
  | { valid: false; error: bigint; raw: string[] };

export function verifierEntrypoint(curve: SupportedCurve): string {
  if (curve === "bn254") return "verify_groth16_proof_bn254";
  const exhaustive: never = curve;
  throw new StarkCircomError("UNSUPPORTED_CURVE", `Unsupported curve ${String(exhaustive)}.`);
}

export function buildGroth16VerifierCall(
  verifierAddress: string,
  preparedProof: StarknetPreparedProof,
): Call {
  let contractAddress: string;
  try {
    contractAddress = validateAndParseAddress(verifierAddress);
  } catch (cause) {
    throw new StarkCircomError("INVALID_INPUT", "The verifier address is not a valid Starknet address.", {
      cause,
    });
  }

  return {
    contractAddress,
    entrypoint: verifierEntrypoint(preparedProof.curve),
    calldata: preparedProof.calldata,
  };
}

export function decodeGaragaVerifierResult(raw: readonly string[]): GaragaVerifierResult {
  if (raw.length < 2) {
    throw new StarkCircomError(
      "MALFORMED_VERIFIER_RESPONSE",
      "The verifier returned fewer than two felts.",
    );
  }

  const variant = toBigInt(raw[0] ?? "", "verifier result variant");
  if (variant === 1n) {
    if (raw.length !== 2) {
      throw new StarkCircomError(
        "MALFORMED_VERIFIER_RESPONSE",
        "The verifier returned a malformed error result.",
      );
    }
    return { valid: false, error: toBigInt(raw[1] ?? "", "verifier error"), raw: [...raw] };
  }
  if (variant !== 0n) {
    throw new StarkCircomError(
      "MALFORMED_VERIFIER_RESPONSE",
      `The verifier returned unknown Result variant ${variant}.`,
    );
  }

  const count = toBigInt(raw[1] ?? "", "public signal count");
  if (count > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new StarkCircomError(
      "MALFORMED_VERIFIER_RESPONSE",
      "The verifier returned an unsupported public-signal count.",
    );
  }

  const expectedLength = 2 + Number(count) * 2;
  if (raw.length !== expectedLength) {
    throw new StarkCircomError(
      "MALFORMED_VERIFIER_RESPONSE",
      `Expected ${expectedLength} response felts but received ${raw.length}.`,
    );
  }

  const publicSignals: bigint[] = [];
  for (let index = 0; index < Number(count); index += 1) {
    const low = toBigInt(raw[2 + index * 2] ?? "", `public signal ${index} low limb`);
    const high = toBigInt(raw[3 + index * 2] ?? "", `public signal ${index} high limb`);
    publicSignals.push(low + (high << 128n));
  }

  return { valid: true, publicSignals, raw: [...raw] };
}

export async function verifyGroth16ProofReadOnly(
  provider: StarknetCallProvider,
  verifierAddress: string,
  preparedProof: StarknetPreparedProof,
  blockIdentifier: BlockIdentifier = "latest",
): Promise<GaragaVerifierResult> {
  const call = buildGroth16VerifierCall(verifierAddress, preparedProof);
  try {
    const raw = await provider.callContract(call, blockIdentifier);
    return decodeGaragaVerifierResult(raw);
  } catch (cause) {
    if (cause instanceof StarkCircomError) throw cause;
    throw new StarkCircomError(
      "STARKNET_CALL_FAILED",
      "The read-only Starknet verifier call failed. No transaction was submitted.",
      { cause },
    );
  }
}
