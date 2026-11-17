import { poseidon1, poseidon2, poseidon5 } from "poseidon-lite";
import { constants, hash } from "starknet";
import type { CircuitSignals } from "@starkcircom/sdk";

const DEPTH = 4;

function merkleProof(leaves: bigint[], selectedIndex: number) {
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

export function randomFieldSecret(): bigint {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return BigInt(`0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`);
}

export function createRecallActionInput(input: {
  actor: string;
  consumer: string;
  ownerSecret: bigint;
  now?: number;
}) {
  const protocolVersion = 1n;
  const chainId = BigInt(constants.StarknetChainId.SN_SEPOLIA);
  const consumer = BigInt(input.consumer);
  const actionId = BigInt(hash.getSelectorFromName("claim_product_recall"));
  const policyVersion = 1n;
  const actor = BigInt(input.actor);
  const serial = 9_876_543_210n;
  const batchId = 42n;
  const claimTier = 2n;
  const now = BigInt(input.now ?? Math.floor(Date.now() / 1000));
  const expiresAt = now + 3_600n;
  const warrantyEnd = now + 31_536_000n;

  const ownerBinding = poseidon2([input.ownerSecret, actor]);
  const productLeaf = poseidon5([serial, ownerBinding, batchId, warrantyEnd, claimTier]);
  const issuedLeaves = Array.from({ length: 16 }, (_, index) =>
    poseidon5([BigInt(1000 + index), BigInt(2000 + index), BigInt(index), 1n, 1n]),
  );
  issuedLeaves[5] = productLeaf;
  const issued = merkleProof(issuedLeaves, 5);

  const affectedLeaves = Array.from({ length: 16 }, (_, index) => poseidon1([BigInt(100 + index)]));
  affectedLeaves[9] = poseidon1([batchId]);
  const affected = merkleProof(affectedLeaves, 9);

  const domain = poseidon5([protocolVersion, chainId, consumer, actionId, policyVersion]);
  const policyHash = poseidon5([
    issued.root,
    affected.root,
    actionId,
    protocolVersion,
    policyVersion,
  ]);
  const nullifier = poseidon5([serial, input.ownerSecret, domain, policyHash, actor]);

  const circuitInput: CircuitSignals = {
    protocolVersion: String(protocolVersion),
    chainId: String(chainId),
    consumer: String(consumer),
    actionId: String(actionId),
    policyVersion: String(policyVersion),
    actor: String(actor),
    policyHash: String(policyHash),
    expiresAt: String(expiresAt),
    nullifier: String(nullifier),
    claimTier: String(claimTier),
    issuedRoot: String(issued.root),
    affectedRoot: String(affected.root),
    serial: String(serial),
    ownerSecret: String(input.ownerSecret),
    batchId: String(batchId),
    warrantyEnd: String(warrantyEnd),
    issuedPathElements: issued.pathElements.map(String),
    issuedPathIndices: issued.pathIndices.map(String),
    affectedPathElements: affected.pathElements.map(String),
    affectedPathIndices: affected.pathIndices.map(String),
  };

  return {
    circuitInput,
    publicConfig: {
      protocolVersion,
      chainId,
      consumer,
      actionId,
      policyVersion,
      actor,
      policyHash,
      expiresAt,
      nullifier,
      claimTier,
      issuedRoot: issued.root,
      affectedRoot: affected.root,
    },
  };
}
