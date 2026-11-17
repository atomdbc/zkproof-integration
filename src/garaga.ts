import * as garaga from "garaga";
import { StarkCircomError } from "./errors.js";
import type {
  Groth16Proof,
  Groth16VerificationKey,
  PublicSignals,
  StarknetPreparedProof,
} from "./types.js";
import {
  assertGroth16VerificationKey,
  curveFromVerificationKey,
  validatePublicSignals,
} from "./validation.js";

let initialization: Promise<unknown> | undefined;

async function initializeGaraga(): Promise<void> {
  initialization ??= garaga.init();
  await initialization;
}

export async function prepareGroth16ProofForStarknet(
  verificationKey: Groth16VerificationKey,
  proof: Groth16Proof,
  publicSignals: PublicSignals,
): Promise<StarknetPreparedProof> {
  assertGroth16VerificationKey(verificationKey);
  const curve = curveFromVerificationKey(verificationKey);
  const normalizedSignals = validatePublicSignals(publicSignals, verificationKey.nPublic);

  if (proof.protocol !== "groth16") {
    throw new StarkCircomError("INVALID_ARTIFACT", "The proof does not use Groth16.");
  }
  if (proof.curve !== "bn128" && proof.curve !== "bn254") {
    throw new StarkCircomError(
      "UNSUPPORTED_CURVE",
      `Unsupported proof curve ${proof.curve}. Circom Groth16 currently requires BN254.`,
    );
  }

  try {
    await initializeGaraga();
    const parsedKey = garaga.parseGroth16VerifyingKeyFromObject(verificationKey);
    const parsedProof = garaga.parseGroth16ProofFromObject(proof, normalizedSignals);
    const calldata = garaga.getGroth16CallData(parsedProof, parsedKey, garaga.CurveId.BN254);

    return {
      proof,
      publicSignals,
      curve,
      calldata: calldata.map(String),
    };
  } catch (cause) {
    throw new StarkCircomError(
      "CALLDATA_GENERATION_FAILED",
      "Garaga could not generate Starknet calldata. Check that the proof, public signals, and verification key match.",
      { cause },
    );
  }
}
