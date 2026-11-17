# StarkCircom

StarkCircom lets a web app prove a private fact locally and use that proof to approve an action on Starknet.

The private information stays in the browser. Starknet receives the proof and public values needed to check it, but not the private witness used to create it.

## What this means

A normal smart contract can only make decisions from public data. StarkCircom adds a private proof before the contract changes state.

For example, a customer can prove all of the following without publishing the underlying product record or ownership secret.

- They own an issued product.
- The product belongs to an affected recall batch.
- Its warranty is still valid.
- The claim is being made by the connected wallet.

If the proof is valid, the consumer contract records the recall claim. It also marks the proof nullifier as spent so the same claim cannot be used twice.

The proof is tied to the chain, contract, wallet, action, policy, expiry time, and authenticated data roots. This prevents someone from copying a valid proof into a different context.

## What is included

- A strict TypeScript SDK for Circom Groth16 proofs
- Local proof generation and local verification with SnarkJS
- Garaga calldata generation for Starknet
- Reproducible Cairo verifier generation
- Sierra, CASM, ABI, and class-hash validation
- A replay-safe Cairo proof consumer
- An owner-managed verifier registry
- A private product-recall circuit
- A browser app for wallet-approved Sepolia deployment
- Tests for valid proofs, invalid proofs, wrong owners, wrong batches, expiry, changed policies, and mismatched contexts

## Use cases

The recall claim is one example. The same pattern can support other actions where a user must prove something without exposing all source data.

### Private warranty and recall claims

Prove ownership, eligibility, and affected-batch membership before recording a claim.

### Private access control

Prove membership, certification, account status, or another policy requirement before granting access.

### Private rewards

Prove that a wallet completed an eligible action without publishing the full activity history.

### Compliance checks

Prove that required checks passed while keeping sensitive identity or business data outside the public transaction.

### Supply-chain actions

Prove that an item belongs to an approved or affected set before allowing a return, replacement, transfer, or payment.

### Private voting and claims

Prove eligibility and prevent repeat participation with a nullifier, without publishing the private eligibility record.

## Run the project

### Requirements

- Node.js 20 or newer
- npm 10 or newer
- Docker for generating and compiling Cairo verifiers
- Argent or Braavos for Sepolia transactions

### Install and test

```bash
npm install
npm run check
```

This builds the development circuits, runs the TypeScript checks, generates real proofs, and runs the test suite.

### Start the app

```bash
npm run web:dev
```

Open the following page.

```text
http://127.0.0.1:3200/actions
```

The app guides the user through one deployment sequence.

1. Check the circuit, verifier, contract artifacts, and class hashes.
2. Connect Argent or Braavos.
3. Switch the wallet to Starknet Sepolia.
4. Add Sepolia STRK if the wallet needs testnet fees.
5. Approve the verifier, consumer, and registry declarations.
6. Approve deployment of the three contracts.
7. Approve the verifier policy registration.
8. Generate the recall proof locally.
9. Approve the proof-bound recall transaction.
10. Read the recorded claim and confirm that its nullifier is spent.

Every declaration and transaction requires approval in the connected wallet. The app never asks for or stores a private key or seed phrase.

## Use the SDK

```ts
import {
  generateGroth16Proof,
  prepareGroth16ProofForStarknet,
  verifyGroth16ProofLocal,
} from "@starkcircom/sdk";
import { loadCircuitBundle } from "@starkcircom/sdk/node";

const bundle = await loadCircuitBundle(
  ".artifacts/multiplier/manifest.json",
);

const { proof, publicSignals } = await generateGroth16Proof(
  { a: 3, b: 11 },
  bundle.artifacts,
);

const valid = await verifyGroth16ProofLocal(
  bundle.verificationKey,
  proof,
  publicSignals,
);

if (!valid) {
  throw new Error("The proof is not valid.");
}

const prepared = await prepareGroth16ProofForStarknet(
  bundle.verificationKey,
  proof,
  publicSignals,
);

console.log(prepared.calldata);
```

`prepareGroth16ProofForStarknet` creates the calldata expected by the generated Garaga verifier. It does not submit a transaction.

For proof-authorized state changes, use `buildProofActionConsumerCall` after checking the decoded action envelope with `assertProofActionEnvelope`.

## Main commands

| Command | Purpose |
| --- | --- |
| `npm run check` | Run type checks, proof tests, and the SDK build |
| `npm run web:dev` | Prepare artifacts and start the browser app |
| `npm run web:build` | Build the browser app for production |
| `npm run action:build` | Build the recall circuit |
| `npm run action:verifier:build` | Generate and compile its Garaga verifier |
| `npm run contracts:build` | Compile and hash the consumer and registry |
| `npm run contracts:test` | Run the Cairo replay and state-change tests |
| `npm run verifier:build` | Build the small multiplier example verifier |
| `npm run clean` | Remove generated artifacts and build output |

## Project structure

```text
apps/deployer/             Browser deployment and proof-action app
circuits/recall_action.circom
                           Private recall circuit
contracts/proof_actions/  Cairo consumer, registry, and tests
scripts/                  Circuit, verifier, and contract builders
src/                      TypeScript SDK
tests/                    SDK and proof-action tests
toolchain/                Pinned Docker builders
```

Generated circuit and contract artifacts are stored under `.artifacts` and are not committed.

## Important limits

The included recall data is synthetic. The issued-product root and affected-batch root show how authenticated membership can work, but they are not connected to a real manufacturer.

A production use case still needs a trusted publisher for those roots, an update policy, a process for missing records, a reviewed proving-key ceremony, and a contract security review.

The repository contains the Sepolia wallet flow, but it contains no wallet credentials and cannot approve transactions by itself.
