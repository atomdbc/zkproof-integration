# Starknet Circom verifier layer research

## Requested outcome

Build a production-focused Starknet verifier layer and TypeScript SDK for Circom and Groth16 teams. A user should be able to bring standard SnarkJS artifacts, deploy or resolve the matching Starknet verifier, generate proof calldata, and consume verification from an app without writing Rust, Python, or Cairo.

This should be a new implementation that reuses the small multiplier circuit as a compatibility fixture. It should not be a cosmetic rewrite of the cloned Express demo.

## Mandatory requirements

- Accept standard Circom and SnarkJS artifacts for Groth16 on BN254.
- Generate proofs locally in Node.js and the browser so private witnesses are not uploaded.
- Generate Garaga-compatible Starknet calldata from a proof, public signals, and verification key.
- Generate and compile a verifier with pinned Garaga, Scarb, and Cairo versions.
- Declare and deploy the verifier through Starknet.js or a connected wallet.
- Support read-only RPC verification and transaction-based consumption by another contract.
- Publish a TypeScript API with useful types and errors.
- Record the verification-key hash, artifact hashes, verifier address, class hash, curve, public-signal count, and toolchain versions in a manifest.
- Reject malformed artifacts, mismatched proof and key pairs, unsupported curves, and out-of-field public inputs before a wallet request.
- Keep proving keys and private witness values out of the hosted build service.
- Include valid-proof, invalid-proof, wrong-public-input, wrong-verifier, and replay-sensitive integration tests.

## Optional features

- A hosted deterministic verifier build service.
- An on-chain registry that maps a circuit identifier and version to a verifier address and manifest hash.
- React hooks for proof generation and verification status.
- Sponsored verification transactions.
- BLS12-381 support.
- A browser workbench for trying the SDK.
- Circuit compilation and trusted-setup orchestration.

## Not part of the first release

- A new proof system or a replacement for Circom, SnarkJS, or Garaga.
- A new universal Groth16 verifier with a dynamic verification key.
- Custody of user wallets or private keys.
- Uploading private witnesses to a server.
- Claims that a local RPC call is an included Starknet transaction.
- A production trusted ceremony managed by this project.

## Acceptance checks

1. A fresh JavaScript project can install the SDK and use it without a local Rust, Python, Cairo, or Scarb toolchain.
2. The included multiplier circuit proves `3 × 11 = 33` and returns `33` as its one public signal.
3. SnarkJS local verification returns true for the generated proof.
4. The SDK creates Garaga calldata deterministically from the proof, public signal, and verification key.
5. A verifier generated from the same key compiles and is declared and deployed on Starknet Sepolia.
6. A fresh read-only `starknet_call` to the deployed verifier accepts the valid proof and returns `33`.
7. Mutating the proof or public signal makes the read-only call fail.
8. A sample consumer contract changes state only after a real Starknet transaction containing a valid proof is accepted.
9. The registry or manifest resolves the exact verifier and class hash for the verification-key hash.
10. Node.js and browser integration tests pass from a clean checkout.
11. The generated source, Sierra, CASM, and manifest are downloadable and hash checked by the client.
12. The README clearly separates local proof verification, read-only Starknet simulation, and an accepted on-chain transaction.

## Baseline audit

The cloned source is commit `0c63e0c2899e1632692d5dd9b8dc8bbfe72aa200` from 12 June 2024.

It is an educational Node.js demo with one multiplication constraint. It proves locally with SnarkJS and verifies locally with SnarkJS. It has no Starknet code, no Cairo contract, no Starknet SDK, no wallet flow, and no deployment flow.

The repository is not runnable from a clean clone. Both Jest tests fail because these ignored artifacts are absent.

- `circuit/circuit_js/circuit.wasm`
- `circuit/circuit_final.zkey`

The checked-in `verification_key.json` cannot create proofs without its matching proving key.

The repository contains three PTAU files with unclear naming and provenance.

- `powersOfTau28_hez_final.ptau` passes SnarkJS verification and contains prepared phase-two data.
- `powersOfTau28_hez_final_10.ptau` has no contribution. SnarkJS says it cannot be used in production.
- `powersOfTau28_hez_final_11.ptau` has a contribution but is not prepared for phase two.

The package declares the ISC license in `package.json`, but the repository has no license file. A rewrite should preserve attribution for copied material and should avoid copying code unless its licensing is confirmed.

## Feasibility evidence

A clean local feasibility run used the cloned `circuit.circom` and the verified final PTAU file.

- Circom compiled one non-linear constraint.
- The circuit has two private inputs and one public output.
- A new circuit-specific Groth16 setup and contribution were created for the test.
- SnarkJS generated a proof for `a = 3` and `b = 11`.
- SnarkJS verified the proof successfully.
- The public signal was `33`.
- Garaga `1.1.0` generated BN254 verifier calldata from the standard SnarkJS JSON objects.
- The generated calldata contained 1,936 felts for this proof.

This proves the Circom to SnarkJS to Garaga data path works. It does not yet prove Starknet execution because no verifier was compiled, deployed, or called.

The Garaga verifier generator also exposed toolchain friction that the proposed product can remove.

- `uvx --from garaga==1.1.0` did not resolve without allowing prereleases because of the pinned `starknet-py-unbroken` release candidate.
- The default dependency resolution selected `fastecdsa 4.0.0`, which caused an import error. Pinning `fastecdsa<4` worked around it.
- `garaga gen` then required a matching `scarb` executable even to finish source generation.

These are packaging and setup problems, not failures in Garaga cryptography.

## Ecosystem findings

### Garaga already closes much of the stated gap

Garaga supports Groth16 verifier generation for BN254 and BLS12-381. It provides optimized Cairo contracts, proof parsing, and calldata generation.

The `garaga` npm package already exposes browser and Node.js TypeScript APIs such as `parseGroth16ProofFromObject`, `parseGroth16VerifyingKeyFromObject`, and `getGroth16CallData`. It uses prebuilt WebAssembly internally. Application developers do not need to write Rust.

Garaga's npm package does not expose the full Cairo verifier source generation and Scarb compilation flow. Its documented verifier generator is still the Python CLI, followed by the Cairo and Scarb toolchain.

### A web-based verifier toolkit already exists

`Godspower-Eze/verifiers-toolkit` accepts Circom and Noir circuits, performs setup and proving, generates Garaga verifiers, compiles them, and deploys them through a wallet.

Its verifier generation runs the Garaga Python CLI as a server subprocess. Its compilation runs Scarb as a server subprocess. It is a web application rather than a general production SDK and registry.

### The original positioning is too broad

“Circom to Starknet without writing Rust” is possible, but it is not an open category. Garaga's TypeScript package and Verifiers Toolkit already cover that claim to different degrees.

A product with only a nicer page around `garaga gen` would be weak and easy to copy.

## Recommended product gap

Build the production integration layer above Garaga rather than another verifier implementation.

The strongest position is this.

> Bring SnarkJS artifacts. Get a reproducible Starknet verifier, a typed TypeScript client, a resolvable circuit manifest, and safe app-contract integration without installing a ZK or Cairo toolchain.

The product should make Garaga easier to use and safer to integrate. It should not claim to replace Garaga.

## Proposed architecture

### TypeScript SDK

Suggested package name is `@starkcircom/sdk` as a working name.

Core operations should include the following.

```ts
const circuit = await StarkCircom.import({
  verificationKey,
  wasmUrl,
  zkeyUrl,
  publicSignals: [{ name: "product", type: "field" }],
});

const { proof, publicSignals } = await circuit.prove({ a: 3, b: 11 });

const prepared = await circuit.prepareStarknetProof({ proof, publicSignals });

const result = await client.verifyReadOnly({
  verifierAddress,
  prepared,
});

const call = client.buildVerifierCall({
  verifierAddress,
  prepared,
});
```

The SDK should expose three clearly different outcomes.

- `verifyLocal` uses SnarkJS and makes no Starknet call.
- `verifyReadOnly` uses Starknet RPC and creates no transaction or durable state.
- `buildVerifierCall` returns calldata for a real transaction or consumer contract flow.

### Deterministic build service

The service receives only the verification key and build options. It does not need the proving key, circuit witness, or private inputs.

It runs a pinned container containing Garaga, Scarb, and Cairo. It returns the following.

- Generated Cairo source
- Sierra artifact
- CASM artifact
- ABI
- Contract class hash
- Verification-key hash
- Toolchain versions
- Build log
- Content-addressed manifest

The browser computes and checks the class hash before asking a wallet to declare it. The service must be treated as untrusted infrastructure, not a source of cryptographic truth.

### Verifier registry

A small Cairo registry maps a stable circuit identifier and semantic version to the following.

- Verification-key hash
- Verifier contract address
- Declared class hash
- Curve
- Public-signal count
- Manifest content hash
- Owner and status

The registry does not prove that a verifier is correct. Correctness comes from reproducible artifacts, class-hash checks, test vectors, and review. The registry provides discovery and version control.

### Consumer contract adapter

A sample Cairo consumer contract should call the selected verifier and bind the returned public signals to application state.

The adapter must demonstrate domain binding. A useful circuit should include values such as the intended app, chain, action, caller, nullifier, and expiry where appropriate. Otherwise, a valid proof can be copied into a different context or front-run.

## Why not build a universal verifier first

Garaga-generated contracts bake the verification key and precomputed pairing lines into Cairo constants. This gives the current optimized verifier its shape.

A dynamic verification-key verifier would require a different cost and security design. It would increase calldata or storage, lose fixed-key precomputation benefits, and require a fresh audit. That is not a wrapper task and should not be hidden inside the first release.

Per-circuit generated verifiers plus a registry are the safer first architecture.

## Security requirements

- Proving must remain local by default.
- The hosted builder receives only public verification material.
- The SDK checks that the proof curve and verification-key curve match.
- Public input values are checked against the correct scalar field.
- Toolchain versions and dependency hashes are pinned.
- The client computes class hashes rather than trusting server-provided values.
- Compiler jobs run in isolated sandboxes with CPU, memory, time, and output limits.
- Circuit source compilation is separate from verification-key-only builds.
- The SDK never stores wallet private keys.
- Consumer examples bind proofs to their intended domain and prevent replay where required.
- Invalid proof behavior is tested at the actual Cairo entry point.
- Mainnet use waits for cryptographic and Cairo security review.

## Delivery plan

### Phase 0

Repair the cloned fixture so it builds all ignored artifacts through scripts rather than relying on missing files. Replace the ambiguous PTAU naming with documented inputs and checksums. Add negative tests.

### Phase 1

Create the TypeScript SDK around SnarkJS, Garaga npm, and Starknet.js. Support local proving, local verification, calldata creation, read-only Starknet verification, and transaction call building.

### Phase 2

Add the pinned verifier build container and API. Return source, Sierra, CASM, ABI, hashes, and a manifest. Add deterministic test vectors.

### Phase 3

Add the Cairo registry and consumer adapter. Deploy to Sepolia and prove valid and invalid behavior with fresh transaction evidence.

### Phase 4

Add the CLI, React hooks, browser workbench, documentation, and one realistic circuit that demonstrates replay-safe application logic.

## Go or no-go

Go if the project is positioned as a production TypeScript integration layer, reproducible builder, registry, and consumer-contract pattern above Garaga.

No-go if the plan is only “Circom to Starknet with no Rust.” That capability already exists and the claim would be misleading.

## Material unknowns

- Whether the target users will accept a hosted compiler or require a local Docker mode.
- Whether the first user flow needs only read-only verification or a state-changing app contract.
- Which real circuit should replace multiplication as the main example.
- Whether Sepolia declaration fees and RPC access are available for fresh execution proof.
- Whether the first release needs BN254 only or BLS12-381 as well.
- Who will review the generated Cairo and integration contracts before mainnet use.
- Whether an on-chain registry is required in the first milestone or can follow the SDK.

## Sources

- Original repository at https://github.com/atomdbc/zkproof-integration
- Garaga repository at https://github.com/keep-starknet-strange/garaga
- Garaga TypeScript package at https://www.npmjs.com/package/garaga
- Garaga Groth16 documentation at https://garaga.gitbook.io/garaga/smart-contract-generators/groth16
- Garaga TypeScript calldata documentation at https://garaga.gitbook.io/garaga/smart-contract-generators/groth16/generating-calldata-from-a-proof-and-using-your-deployed-contract/using-typescript
- Verifiers Toolkit at https://github.com/Godspower-Eze/verifiers-toolkit
- Starknet documentation at https://docs.starknet.io/
- SnarkJS at https://github.com/iden3/snarkjs
- Circom at https://github.com/iden3/circom
