import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadVerifierBuild } from "../src/node.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestPath = resolve(root, ".artifacts/verifiers/multiplier_verifier/manifest.json");
const verificationKeyPath = resolve(root, ".artifacts/multiplier/verification_key.json");

describe.skipIf(!existsSync(manifestPath))("pinned verifier build", () => {
  it("loads hash-checked Sierra, CASM, ABI, and declaration data", async () => {
    const verifier = await loadVerifierBuild(manifestPath, {
      verificationKeyFile: verificationKeyPath,
    });

    expect(verifier.manifest.toolchain.garaga).toBe("1.1.0");
    expect(verifier.manifest.toolchain.garagaCommit).toBe(
      "307c00af4a7f08653123d1ec9a6edae81f288260",
    );
    expect(verifier.manifest.toolchain.scarb).toContain("scarb 2.16.1");
    expect(verifier.manifest.classHash).toMatch(/^0x[0-9a-f]+$/u);
    expect(verifier.manifest.compiledClassHash).toMatch(/^0x[0-9a-f]+$/u);
    expect(verifier.declaration.classHash).toBe(verifier.manifest.classHash);
    expect(verifier.declaration.compiledClassHash).toBe(verifier.manifest.compiledClassHash);
    expect(verifier.abi.length).toBeGreaterThan(0);
  });

  it("contains the BN254 Groth16 verifier entrypoint", async () => {
    const source = await readFile(
      resolve(
        root,
        ".artifacts/verifiers/multiplier_verifier/source/src/groth16_verifier.cairo",
      ),
      "utf8",
    );
    expect(source).toContain("fn verify_groth16_proof_bn254(");
  });
});

const actionManifestPath = resolve(
  root,
  ".artifacts/verifiers/recall_action_verifier/manifest.json",
);
const actionVerificationKeyPath = resolve(root, ".artifacts/recall_action/verification_key.json");

describe.skipIf(!existsSync(actionManifestPath))("proof-action verifier build", () => {
  it("loads the verifier generated for the 11-signal recall circuit", async () => {
    const verifier = await loadVerifierBuild(actionManifestPath, {
      verificationKeyFile: actionVerificationKeyPath,
    });
    expect(verifier.manifest.projectName).toBe("recall_action_verifier");
    expect(verifier.manifest.classHash).toMatch(/^0x[0-9a-f]+$/u);
    expect(verifier.manifest.compiledClassHash).toMatch(/^0x[0-9a-f]+$/u);
    expect(verifier.manifest.toolchain.scarb).toContain("scarb 2.16.1");
  });
});
