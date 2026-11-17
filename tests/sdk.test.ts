import { appendFile, cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  BN254_SCALAR_FIELD,
  buildGroth16VerifierCall,
  decodeGaragaVerifierResult,
  generateGroth16Proof,
  prepareGroth16ProofForStarknet,
  verifyGroth16ProofLocal,
  verifyGroth16ProofReadOnly,
  type GeneratedGroth16Proof,
  type LoadedCircuitBundle,
  type StarknetPreparedProof,
} from "../src/index.js";
import { loadCircuitBundle } from "../src/node.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

let bundle: LoadedCircuitBundle;
let generated: GeneratedGroth16Proof;
let prepared: StarknetPreparedProof;

beforeAll(async () => {
  bundle = await loadCircuitBundle(resolve(root, ".artifacts/multiplier/manifest.json"));
  generated = await generateGroth16Proof({ a: 3, b: 11 }, bundle.artifacts);
  prepared = await prepareGroth16ProofForStarknet(
    bundle.verificationKey,
    generated.proof,
    generated.publicSignals,
  );
});

describe("Groth16 proof flow", () => {
  it("generates and verifies the multiplier proof", async () => {
    expect(generated.publicSignals).toEqual(["33"]);
    await expect(
      verifyGroth16ProofLocal(bundle.verificationKey, generated.proof, generated.publicSignals),
    ).resolves.toBe(true);
  });

  it("rejects a changed public signal", async () => {
    await expect(
      verifyGroth16ProofLocal(bundle.verificationKey, generated.proof, ["34"]),
    ).resolves.toBe(false);
  });

  it("rejects public signals outside the scalar field", async () => {
    await expect(
      verifyGroth16ProofLocal(bundle.verificationKey, generated.proof, [BN254_SCALAR_FIELD.toString()]),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("Garaga Starknet preparation", () => {
  it("generates stable calldata for a proof", async () => {
    const second = await prepareGroth16ProofForStarknet(
      bundle.verificationKey,
      generated.proof,
      generated.publicSignals,
    );

    expect(prepared.calldata.length).toBeGreaterThan(1_000);
    expect(second.calldata).toEqual(prepared.calldata);
    expect(prepared.curve).toBe("bn254");
  });

  it("builds the correct verifier call", () => {
    const call = buildGroth16VerifierCall("0x1", prepared);
    expect(call.entrypoint).toBe("verify_groth16_proof_bn254");
    expect(call.calldata).toEqual(prepared.calldata);
  });
});

describe("Garaga verifier response decoding", () => {
  it("decodes successful u256 public signals", () => {
    const high = 2n;
    const result = decodeGaragaVerifierResult(["0", "1", "33", high.toString()]);
    expect(result).toEqual({
      valid: true,
      publicSignals: [33n + (high << 128n)],
      raw: ["0", "1", "33", "2"],
    });
  });

  it("decodes verifier errors", () => {
    expect(decodeGaragaVerifierResult(["1", "99"])).toEqual({
      valid: false,
      error: 99n,
      raw: ["1", "99"],
    });
  });

  it("uses a read-only provider call without creating a transaction", async () => {
    const callContract = vi.fn().mockResolvedValue(["0", "1", "33", "0"]);
    const result = await verifyGroth16ProofReadOnly(
      { callContract },
      "0x1",
      prepared,
    );

    expect(result.valid).toBe(true);
    expect(callContract).toHaveBeenCalledOnce();
    expect(callContract.mock.calls[0]?.[0]).toMatchObject({
      entrypoint: "verify_groth16_proof_bn254",
    });
  });
});

describe("artifact manifest", () => {
  it("loads a hash-checked development bundle", () => {
    expect(bundle.manifest.setup.purpose).toBe("development-only");
    expect(bundle.manifest.publicSignals).toEqual([
      { name: "product", index: 0, type: "field" },
    ]);
    expect(bundle.verificationKey.nPublic).toBe(1);
  });

  it("rejects an artifact changed after the manifest was written", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "starkcircom-manifest-"));
    const copiedBundle = join(temporaryRoot, "multiplier");
    try {
      await cp(resolve(root, ".artifacts/multiplier"), copiedBundle, { recursive: true });
      await appendFile(join(copiedBundle, "verification_key.json"), "\n");

      await expect(loadCircuitBundle(join(copiedBundle, "manifest.json"))).rejects.toMatchObject({
        code: "INVALID_ARTIFACT",
      });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
