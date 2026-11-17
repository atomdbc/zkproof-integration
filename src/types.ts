import type {
  Abi,
  CompiledSierra,
  CompiledSierraCasm,
  CompleteDeclareContractPayload,
} from "starknet";
import type {
  CircuitSignals,
  Groth16Proof,
  PublicSignals,
  ZKArtifact,
} from "snarkjs";

export type { CircuitSignals, Groth16Proof, PublicSignals, ZKArtifact };

export type JsonObject = Record<string, unknown>;
export type SupportedCurve = "bn254";

export interface Groth16VerificationKey extends JsonObject {
  protocol: "groth16" | string;
  curve: "bn128" | "bn254" | string;
  nPublic: number;
}

export interface Groth16Artifacts {
  wasm: ZKArtifact;
  zkey: ZKArtifact;
}

export interface GeneratedGroth16Proof {
  proof: Groth16Proof;
  publicSignals: PublicSignals;
}

export interface StarknetPreparedProof extends GeneratedGroth16Proof {
  curve: SupportedCurve;
  calldata: string[];
}

export interface ManifestArtifact {
  path: string;
  sha256: string;
}

export interface CircuitManifest {
  schemaVersion: 1;
  proofSystem: "groth16";
  curve: SupportedCurve;
  circuit: {
    name: string;
    source: string;
    sourceSha256: string;
    dependencies?: Array<{
      path: string;
      sha256: string;
    }>;
  };
  publicSignals: Array<{
    name: string;
    index: number;
    type: "field";
  }>;
  setup: {
    purpose: "development-only" | "production";
    ptau: string;
    ptauSha256: string;
  };
  toolchain: {
    circom2: string;
    circomlib?: string;
    snarkjs: string;
  };
  artifacts: {
    wasm: ManifestArtifact;
    r1cs: ManifestArtifact;
    zkey: ManifestArtifact;
    verificationKey: ManifestArtifact;
  };
}

export interface LoadedCircuitBundle {
  manifest: CircuitManifest;
  verificationKey: Groth16VerificationKey;
  artifacts: Groth16Artifacts;
}

export interface VerifierBuildManifest {
  schemaVersion: 1;
  projectName: string;
  proofSystem: "groth16";
  curve: SupportedCurve;
  verificationKeySha256: string;
  entrypoint: "verify_groth16_proof_bn254";
  classHash: string;
  compiledClassHash: string;
  toolchain: {
    garaga: string;
    garagaCommit: string;
    python: string;
    scarb: string;
  };
  files: Record<string, { sha256: string }>;
}

export interface LoadedVerifierBuild {
  manifest: VerifierBuildManifest;
  sierra: CompiledSierra;
  casm: CompiledSierraCasm;
  abi: Abi;
  declaration: CompleteDeclareContractPayload;
}
