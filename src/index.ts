export {
  assertProofActionEnvelope,
  buildProofActionConsumerCall,
  decodeProofActionEnvelope,
  PROOF_ACTION_SIGNAL_NAMES,
  type ProofActionEnvelope,
  type ProofActionExpectation,
} from "./action.js";
export { StarkCircomError, type StarkCircomErrorCode } from "./errors.js";
export { prepareGroth16ProofForStarknet } from "./garaga.js";
export { generateGroth16Proof, verifyGroth16ProofLocal } from "./proof.js";
export {
  buildGroth16VerifierCall,
  decodeGaragaVerifierResult,
  verifierEntrypoint,
  verifyGroth16ProofReadOnly,
  type GaragaVerifierResult,
  type StarknetCallProvider,
} from "./starknet.js";
export type {
  CircuitManifest,
  CircuitSignals,
  GeneratedGroth16Proof,
  Groth16Artifacts,
  Groth16Proof,
  Groth16VerificationKey,
  LoadedCircuitBundle,
  LoadedVerifierBuild,
  PublicSignals,
  StarknetPreparedProof,
  SupportedCurve,
  VerifierBuildManifest,
  ZKArtifact,
} from "./types.js";
export {
  BN254_SCALAR_FIELD,
  assertGroth16VerificationKey,
  curveFromVerificationKey,
  toBigInt,
  validatePublicSignals,
} from "./validation.js";
