import { groth16 } from "snarkjs";
import { StarkCircomError } from "./errors.js";
import type {
  CircuitSignals,
  GeneratedGroth16Proof,
  Groth16Artifacts,
  Groth16Proof,
  Groth16VerificationKey,
  PublicSignals,
} from "./types.js";
import { assertGroth16VerificationKey, validatePublicSignals } from "./validation.js";

export async function generateGroth16Proof(
  input: CircuitSignals,
  artifacts: Groth16Artifacts,
): Promise<GeneratedGroth16Proof> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new StarkCircomError("INVALID_INPUT", "Circuit input must be an object keyed by signal name.");
  }
  if (!artifacts.wasm || !artifacts.zkey) {
    throw new StarkCircomError("INVALID_ARTIFACT", "Both WASM and zkey artifacts are required.");
  }

  try {
    return await groth16.fullProve(input, artifacts.wasm, artifacts.zkey);
  } catch (cause) {
    throw new StarkCircomError(
      "INVALID_INPUT",
      "Groth16 proof generation failed. Check the circuit inputs and artifact pair.",
      { cause },
    );
  }
}

export async function verifyGroth16ProofLocal(
  verificationKey: Groth16VerificationKey,
  proof: Groth16Proof,
  publicSignals: PublicSignals,
): Promise<boolean> {
  assertGroth16VerificationKey(verificationKey);
  validatePublicSignals(publicSignals, verificationKey.nPublic);

  try {
    return await groth16.verify(verificationKey, publicSignals, proof);
  } catch (cause) {
    throw new StarkCircomError(
      "INVALID_ARTIFACT",
      "Groth16 verification failed because the proof or verification key is malformed.",
      { cause },
    );
  }
}
