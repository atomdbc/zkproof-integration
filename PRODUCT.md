# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary operator is a TypeScript developer or project owner preparing a Circom Groth16 verifier and a proof-dependent Starknet action. They review reproducible artifacts, connect Argent or Braavos, approve Sepolia transactions, and collect execution evidence.

A recall claimant is the first application user. They prove product ownership, affected-batch membership, warranty validity, and claim tier locally before approving a one-time claim transaction.

## Product Purpose

StarkCircom turns locally generated Circom Groth16 proofs into Starknet verifier calls and replay-safe state changes without requiring application teams to write Rust or Cairo. Success means the exact proof authorizes the exact action once, for the intended chain, contract, caller, policy, and time window.

## Positioning

The product combines a TypeScript-first proving SDK, reproducible Garaga verifier builds, wallet-controlled deployment, and a standard proof-bound action envelope. It does not stop at showing that a proof verifies. Its consumer contract checks application context and changes state only after verification.

## Operating Context

Operators work with circuit, verification-key, Sierra, CASM, ABI, class-hash, deployment, and transaction artifacts. Private witnesses remain in the browser or local development environment. Argent or Braavos remains the signing authority. Sepolia RPC calls are distinct from wallet transactions.

## Capabilities and Constraints

- Groth16 on BN254 through Circom, SnarkJS, and Garaga.
- Local proving and local verification.
- Hash-checked circuit, verifier, and Cairo contract artifacts.
- Wallet-approved declaration, UDC deployment, registry update, and proof consumption.
- Twelve public action signals bind protocol, chain, consumer, action, policy version, actor, policy hash, expiry, nullifier, result, and authenticated-set roots.
- Private keys and seed phrases are never requested.
- The included recall issuer and affected-batch roots are synthetic demonstration data.
- Mainnet use requires an independent cryptographic and Cairo review.

## Evidence on Hand

- SDK and circuit tests under `tests/`.
- Recall circuit under `circuits/recall_action.circom`.
- Consumer and registry under `contracts/proof_actions/`.
- Hash-checked generated artifacts under ignored `.artifacts/` directories.
- The latest production-browser recall proof completed locally in 1.28 seconds with no browser errors.
- No live Sepolia declaration, deployment, or proof-consumption receipt exists yet.
- No authenticated manufacturer data or customer validation exists yet.

## Product Principles

- Keep private witnesses local.
- Make proof context explicit and reject replay.
- Separate local checks, read-only RPC calls, and wallet transactions.
- Make every external execution claim traceable to a receipt.
- Never hide missing funding, authority, source authenticity, or security review.

## Accessibility & Inclusion

The deployment workbench must support keyboard operation, visible focus, reduced motion, readable status language, and responsive layouts for desktop and mobile web.
