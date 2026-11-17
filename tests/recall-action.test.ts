import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  assertProofActionEnvelope,
  buildProofActionConsumerCall,
  decodeProofActionEnvelope,
  generateGroth16Proof,
  prepareGroth16ProofForStarknet,
  verifyGroth16ProofLocal,
  type GeneratedGroth16Proof,
  type LoadedCircuitBundle,
  type StarknetPreparedProof,
} from "../src/index.js";
import { loadCircuitBundle } from "../src/node.js";
import { createRecallActionFixture } from "./fixtures/recall-action.js";

let bundle: LoadedCircuitBundle;
let generated: GeneratedGroth16Proof;
let prepared: StarknetPreparedProof;
const fixture = createRecallActionFixture();

beforeAll(async () => {
  bundle = await loadCircuitBundle(resolve(".artifacts/recall_action/manifest.json"));
  generated = await generateGroth16Proof(fixture.input, bundle.artifacts);
  prepared = await prepareGroth16ProofForStarknet(
    bundle.verificationKey,
    generated.proof,
    generated.publicSignals,
  );
});

describe("proof-bound recall action", () => {
  it("proves issued-product ownership, affected-batch membership, and warranty validity", async () => {
    expect(await verifyGroth16ProofLocal(
      bundle.verificationKey,
      generated.proof,
      generated.publicSignals,
    )).toBe(true);

    const envelope = decodeProofActionEnvelope(generated.publicSignals);
    expect(envelope).toEqual(fixture.expected);
    expect(() => assertProofActionEnvelope(envelope, {
      chainId: fixture.expected.chainId,
      consumer: fixture.expected.consumer,
      actionId: fixture.expected.actionId,
      actor: fixture.expected.actor,
      policyHash: fixture.expected.policyHash,
      now: fixture.expected.expiresAt - 1n,
    })).not.toThrow();
  });

  it("builds a state-changing consumer call rather than a verifier-only call", () => {
    const call = buildProofActionConsumerCall("0x1234", prepared);
    expect(BigInt(call.contractAddress)).toBe(0x1234n);
    expect(call.entrypoint).toBe("consume_proof_action");
    expect(call.calldata).toEqual(prepared.calldata);
  });

  it("rejects a proof envelope for another consumer, actor, action, policy, or time", () => {
    const envelope = decodeProofActionEnvelope(generated.publicSignals);
    for (const changed of [
      { consumer: 0x9999n },
      { actor: 0x9999n },
      { actionId: 0x9999n },
      { policyVersion: 2n },
      { policyHash: 0x9999n },
      { now: envelope.expiresAt + 1n },
    ]) {
      expect(() => assertProofActionEnvelope(envelope, {
        chainId: envelope.chainId,
        consumer: envelope.consumer,
        actionId: envelope.actionId,
        policyVersion: envelope.policyVersion,
        actor: envelope.actor,
        policyHash: envelope.policyHash,
        now: envelope.expiresAt,
        ...changed,
      })).toThrow();
    }
  });

  it("cannot generate a proof with the wrong ownership secret", async () => {
    await expect(generateGroth16Proof(
      { ...fixture.input, ownerSecret: "7654322" },
      bundle.artifacts,
    )).rejects.toThrow("proof generation failed");
  });

  it("cannot generate a proof for an unlisted affected batch", async () => {
    await expect(generateGroth16Proof(
      { ...fixture.input, batchId: "43" },
      bundle.artifacts,
    )).rejects.toThrow("proof generation failed");
  });
});
