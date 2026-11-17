import type { Call } from "starknet";
import { validateAndParseAddress } from "starknet";
import { StarkCircomError } from "./errors.js";
import type { PublicSignals, StarknetPreparedProof } from "./types.js";
import { toBigInt, validatePublicSignals } from "./validation.js";

export const PROOF_ACTION_SIGNAL_NAMES = [
  "protocolVersion",
  "chainId",
  "consumer",
  "actionId",
  "policyVersion",
  "actor",
  "policyHash",
  "expiresAt",
  "nullifier",
  "result",
  "issuedRoot",
  "affectedRoot",
] as const;

export interface ProofActionEnvelope {
  protocolVersion: bigint;
  chainId: bigint;
  consumer: bigint;
  actionId: bigint;
  policyVersion: bigint;
  actor: bigint;
  policyHash: bigint;
  expiresAt: bigint;
  nullifier: bigint;
  result: bigint;
  issuedRoot: bigint;
  affectedRoot: bigint;
}

export interface ProofActionExpectation {
  protocolVersion?: string | number | bigint;
  policyVersion?: string | number | bigint;
  chainId: string | number | bigint;
  consumer: string | number | bigint;
  actionId: string | number | bigint;
  actor: string | number | bigint;
  policyHash: string | number | bigint;
  now: string | number | bigint;
}

export function decodeProofActionEnvelope(publicSignals: PublicSignals): ProofActionEnvelope {
  const signals = validatePublicSignals(publicSignals, PROOF_ACTION_SIGNAL_NAMES.length);
  return Object.fromEntries(
    PROOF_ACTION_SIGNAL_NAMES.map((name, index) => [name, signals[index]]),
  ) as unknown as ProofActionEnvelope;
}

export function assertProofActionEnvelope(
  envelope: ProofActionEnvelope,
  expected: ProofActionExpectation,
): void {
  const checks: Array<[keyof ProofActionEnvelope, string | number | bigint]> = [
    ["protocolVersion", expected.protocolVersion ?? 1n],
    ["chainId", expected.chainId],
    ["consumer", expected.consumer],
    ["actionId", expected.actionId],
    ["policyVersion", expected.policyVersion ?? 1n],
    ["actor", expected.actor],
    ["policyHash", expected.policyHash],
  ];
  for (const [name, value] of checks) {
    const wanted = toBigInt(value, `expected ${name}`);
    if (envelope[name] !== wanted) {
      throw new StarkCircomError(
        "INVALID_INPUT",
        `The proof action ${name} does not match the intended transaction context.`,
      );
    }
  }

  const now = toBigInt(expected.now, "expected now");
  if (envelope.expiresAt < now) {
    throw new StarkCircomError("INVALID_INPUT", "The proof action has expired.");
  }
  if (envelope.nullifier === 0n) {
    throw new StarkCircomError("INVALID_INPUT", "The proof action nullifier cannot be zero.");
  }
}

export function buildProofActionConsumerCall(
  consumerAddress: string,
  preparedProof: StarknetPreparedProof,
  entrypoint = "consume_proof_action",
): Call {
  let contractAddress: string;
  try {
    contractAddress = validateAndParseAddress(consumerAddress);
  } catch (cause) {
    throw new StarkCircomError("INVALID_INPUT", "The consumer address is not a valid Starknet address.", {
      cause,
    });
  }
  if (!entrypoint) {
    throw new StarkCircomError("INVALID_INPUT", "The consumer entrypoint cannot be empty.");
  }
  return {
    contractAddress,
    entrypoint,
    calldata: preparedProof.calldata,
  };
}
