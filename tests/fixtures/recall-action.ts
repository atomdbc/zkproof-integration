import { poseidon1, poseidon2, poseidon5 } from "poseidon-lite";
import { constants, hash } from "starknet";
import type { CircuitSignals } from "../../src/types.js";

const DEPTH = 4;

function merkleProof(leaves: bigint[], selectedIndex: number) {
  if (leaves.length !== 2 ** DEPTH) throw new Error("The fixture tree has the wrong size.");
  const pathElements: bigint[] = [];
  const pathIndices: bigint[] = [];
  let index = selectedIndex;
  let level = leaves;
  for (let depth = 0; depth < DEPTH; depth += 1) {
    pathElements.push(level[index ^ 1] ?? 0n);
    pathIndices.push(BigInt(index & 1));
    const next: bigint[] = [];
    for (let offset = 0; offset < level.length; offset += 2) {
      next.push(poseidon2([level[offset] ?? 0n, level[offset + 1] ?? 0n]));
    }
    level = next;
    index = Math.floor(index / 2);
  }
  return { root: level[0] ?? 0n, pathElements, pathIndices };
}

export function createRecallActionFixture(overrides: Partial<Record<string, bigint>> = {}) {
  const protocolVersion = overrides.protocolVersion ?? 1n;
  const chainId = overrides.chainId ?? BigInt(constants.StarknetChainId.SN_SEPOLIA);
  const consumer = overrides.consumer ?? 0x1234n;
  const actionId = overrides.actionId ?? BigInt(hash.getSelectorFromName("claim_product_recall"));
  const policyVersion = overrides.policyVersion ?? 1n;
  const actor = overrides.actor ?? 0x4567n;
  const serial = overrides.serial ?? 9_876_543_210n;
  const ownerSecret = overrides.ownerSecret ?? 7_654_321n;
  const batchId = overrides.batchId ?? 42n;
  const warrantyEnd = overrides.warrantyEnd ?? 2_000_000_000n;
  const expiresAt = overrides.expiresAt ?? 1_900_000_000n;
  const claimTier = overrides.claimTier ?? 2n;

  const ownerBinding = poseidon2([ownerSecret, actor]);
  const productLeaf = poseidon5([serial, ownerBinding, batchId, warrantyEnd, claimTier]);
  const issuedLeaves = Array.from({ length: 2 ** DEPTH }, (_, index) =>
    poseidon5([BigInt(1000 + index), BigInt(2000 + index), BigInt(index), 1n, 1n]),
  );
  const issuedIndex = 5;
  issuedLeaves[issuedIndex] = productLeaf;
  const issued = merkleProof(issuedLeaves, issuedIndex);

  const affectedLeaves = Array.from({ length: 2 ** DEPTH }, (_, index) =>
    poseidon1([BigInt(100 + index)]),
  );
  const affectedIndex = 9;
  affectedLeaves[affectedIndex] = poseidon1([batchId]);
  const affected = merkleProof(affectedLeaves, affectedIndex);

  const domain = poseidon5([protocolVersion, chainId, consumer, actionId, policyVersion]);
  const policyHash = poseidon5([
    issued.root,
    affected.root,
    actionId,
    protocolVersion,
    policyVersion,
  ]);
  const nullifier = poseidon5([serial, ownerSecret, domain, policyHash, actor]);

  const input: CircuitSignals = {
    protocolVersion: protocolVersion.toString(),
    chainId: chainId.toString(),
    consumer: consumer.toString(),
    actionId: actionId.toString(),
    policyVersion: policyVersion.toString(),
    actor: actor.toString(),
    policyHash: policyHash.toString(),
    expiresAt: expiresAt.toString(),
    nullifier: nullifier.toString(),
    claimTier: claimTier.toString(),
    issuedRoot: issued.root.toString(),
    affectedRoot: affected.root.toString(),
    serial: serial.toString(),
    ownerSecret: ownerSecret.toString(),
    batchId: batchId.toString(),
    warrantyEnd: warrantyEnd.toString(),
    issuedPathElements: issued.pathElements.map(String),
    issuedPathIndices: issued.pathIndices.map(String),
    affectedPathElements: affected.pathElements.map(String),
    affectedPathIndices: affected.pathIndices.map(String),
  };

  return {
    input,
    expected: {
      protocolVersion,
      chainId,
      consumer,
      actionId,
      policyVersion,
      actor,
      policyHash,
      expiresAt,
      nullifier,
      result: claimTier,
      issuedRoot: issued.root,
      affectedRoot: affected.root,
    },
  };
}
