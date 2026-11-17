# StarkCircom SDK

TypeScript tools for turning a local Circom Groth16 proof into a replay-safe Starknet action.

The SDK supports Circom and SnarkJS Groth16 proofs on BN254. It proves and verifies locally, prepares Garaga calldata, builds Starknet calls, decodes verifier responses, and creates compiled Cairo artifacts through pinned Docker builders.

The repository now includes a proof-bound recall claim. Its 12 public signals bind the proof to the protocol version, Starknet chain, consumer contract, action, policy version, wallet actor, policy hash, expiry, nullifier, result, and two authenticated-set roots. A Cairo consumer verifies those bindings, rejects replayed nullifiers, and records a claim tier. A separate registry commits a policy to the verifier address, class hash, artifact-manifest hash, and public-signal count.

The browser app validates the artifacts and asks Argent or Braavos to approve declarations, deployments, registry writes, and proof consumption on Starknet Sepolia. Private witness values are generated and proved in the browser. The wallet remains the signing authority. No live deployment has been performed or verified yet.

## What changed

The original repository was a small Express demonstration that depended on missing generated files. The overhaul replaces it with the following.

- Strict TypeScript SDK
- Reproducible development artifact script
- Hash-checked circuit manifests
- Local Groth16 proving and verification
- Garaga Starknet calldata generation
- Typed read-only Starknet verification calls
- Pinned Garaga 1.1.0, Scarb 2.16.1, and Cairo 2.16.1 verifier builder
- Client-side Sierra and CASM class-hash checks
- Declaration payload creation from hash-checked build artifacts
- Wallet-approved Sepolia declaration and UDC deployment app
- Fresh read-only verification of a fixed sample after deployment
- Proof-action envelope validation and exact consumer-call construction
- An 8,508-constraint private recall circuit with 12 public bindings
- Replay-safe Cairo consumer and owner-managed verifier registry
- Browser-local recall proof generation followed by a wallet transaction
- Clear separation between local checks, RPC calls, and transactions
- Valid, invalid, wrong-owner, wrong-batch, and context-mismatch proof tests

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- Docker for verifier generation and compilation

SDK consumers do not need to install Rust, Python, Cairo, or Scarb. The verifier builder contains the pinned Python and Cairo toolchain.

## Install and check

```bash
npm install
npm run check
```

The first test run builds the development multiplier circuit and creates ignored artifacts under `.artifacts/multiplier`.

## Basic usage

```ts
import {
  generateGroth16Proof,
  prepareGroth16ProofForStarknet,
  verifyGroth16ProofLocal,
} from "@starkcircom/sdk";
import { loadCircuitBundle } from "@starkcircom/sdk/node";

const bundle = await loadCircuitBundle(".artifacts/multiplier/manifest.json");

const { proof, publicSignals } = await generateGroth16Proof(
  { a: 3, b: 11 },
  bundle.artifacts,
);

const validLocally = await verifyGroth16ProofLocal(
  bundle.verificationKey,
  proof,
  publicSignals,
);

const prepared = await prepareGroth16ProofForStarknet(
  bundle.verificationKey,
  proof,
  publicSignals,
);

console.log(validLocally); // true
console.log(publicSignals); // ["33"]
console.log(prepared.calldata.length);
```

## Read-only Starknet verification

Once the matching Garaga verifier is deployed, it can be called without submitting a transaction.

```ts
import { RpcProvider } from "starknet";
import { verifyGroth16ProofReadOnly } from "@starkcircom/sdk";

const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });

const result = await verifyGroth16ProofReadOnly(
  provider,
  "0x_verifier_address",
  prepared,
);
```

A read-only call is RPC simulation. It does not create a transaction and does not change Starknet state.

For a state-changing application flow, use `buildGroth16VerifierCall` and include the returned call in a wallet or consumer-contract transaction.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run circuit:build` | Build missing or stale development artifacts |
| `npm run circuit:rebuild` | Force a fresh development setup and contribution |
| `npm run verifier:build` | Generate and compile the multiplier Cairo verifier in Docker |
| `npm run action:build` | Build or reuse the recall circuit artifacts |
| `npm run action:rebuild` | Force a fresh recall-circuit setup and contribution |
| `npm run action:verifier:build` | Generate and compile the recall verifier |
| `npm run contracts:build` | Compile and hash the consumer and registry artifacts |
| `npm run contracts:test` | Run replay and state-change tests in a pinned Snforge container |
| `npm run test:verifier` | Rebuild and validate the multiplier verifier bundle |
| `npm test` | Run proof, calldata, manifest, and Starknet call tests |
| `npm run typecheck` | Run strict SDK TypeScript checks |
| `npm run web:typecheck` | Run strict deployment-app TypeScript checks |
| `npm run web:dev` | Build required artifacts and start the deployment app |
| `npm run web:build` | Create a production deployment-app build |
| `npm run build` | Emit the SDK into `dist` |
| `npm run check` | Run SDK and app type checks, tests, and the package build |
| `npm run clean` | Remove generated artifacts and build output |

## Artifact safety

The bundled PTAU file and generated circuit-specific contribution are development fixtures. They are not presented as a production ceremony.

The build writes hashes for the WASM, R1CS, zkey, and verification key into the circuit manifest. `loadCircuitBundle` checks each hash before returning paths to the prover.

Production deployments should use a documented ceremony, independently verified artifacts, pinned verifier toolchains, and a security review.

## Verifier build

```bash
npm run verifier:build
```

The builder accepts only the public verification key. It generates the Garaga Cairo source, compiles Sierra and CASM, extracts the ABI, computes class hashes on the host with Starknet.js, and writes a hash-checked manifest under `.artifacts/verifiers/multiplier_verifier`.

The default toolchain is pinned to Garaga 1.1.0 at commit `307c00af4a7f08653123d1ec9a6edae81f288260`, Scarb 2.16.1, Cairo 2.16.1, and Python 3.12.12. Python dependencies are locked. The Python base image uses a fixed digest. Scarb release downloads are checked against official SHA-256 values for AMD64 and ARM64 Linux.

Load the output before declaration.

```ts
import { loadVerifierBuild } from "@starkcircom/sdk/node";

const verifier = await loadVerifierBuild(
  ".artifacts/verifiers/multiplier_verifier/manifest.json",
  { verificationKeyFile: ".artifacts/multiplier/verification_key.json" },
);

// Suitable for account.declare after wallet approval.
console.log(verifier.declaration);
```

No wallet action is performed by the build command.

The current ignored artifacts were rebuilt with an explicit local fallback using Garaga 1.1.0, Scarb/Cairo 2.16.1, and Python 3.12.11 after Docker Desktop reported content-store I/O errors. Their manifests record that toolchain. Re-run the default Docker builders and compare the resulting hashes before a release.

## Wallet deployment app

```bash
npm run web:dev
```

Open `http://127.0.0.1:3200`, connect Argent or Braavos, and approve each requested action in the wallet. The account must be on Starknet Sepolia and funded with Sepolia STRK. Open `/actions` for the proof-bound recall launch workbench. It checks the fee balance, links to a Sepolia faucet when empty, and records confirmed transaction hashes and deployed addresses with Voyager links.

The app does the following.

1. Loads the generated verifier bundle through `loadVerifierBuild`.
2. Recomputes the Sierra and CASM class hashes in the browser.
3. Checks whether the class is already declared on Sepolia.
4. Requests wallet approval for declaration when needed.
5. Requests wallet approval for a unique UDC deployment.
6. Generates the fixed `3 × 11 = 33` sample proof and performs a read-only RPC verification against the deployed contract.

The app never reads or stores a private key or seed phrase. The multiplier sample route uses only fixed demonstration inputs. The recall flow creates its ownership secret in the browser and sends no private witness to an API. The server serves only public WASM, zkey, verification-key, and Cairo artifacts.

The recall data is synthetic. Its issued-product and affected-batch roots demonstrate authenticated-set membership, but they are not production manufacturer attestations. A real deployment must define who publishes each root, how updates are authorized, how omissions are challenged, and how users recover when source data is missing.

## Current status

| Capability | Status |
| --- | --- |
| Compile the included circuit | Met |
| Generate a Groth16 proof locally | Met |
| Verify a proof locally | Met |
| Generate Garaga calldata | Met |
| Build a typed Starknet verifier call | Met |
| Decode a Garaga verifier result | Met |
| Generate Garaga Cairo verifier | Met |
| Compile Sierra, CASM, and ABI | Met |
| Verify artifact and class hashes | Met |
| Build a declaration payload | Met |
| Wallet declaration and deployment flow | Met in code, not executed |
| Declare and deploy verifier to Sepolia | Missing live wallet execution |
| Execute a fresh Starknet verification | Missing until deployment |
| Proof-bound recall circuit and action envelope | Met |
| Replay-safe consumer and verifier registry source | Met |
| Compile and hash consumer and registry artifacts | Met |
| Browser-local recall proof | Met, latest production-browser check completed in 1.28 seconds with no browser errors |
| Wallet-approved recall action flow | Met in code, not executed |
| Consumer replay/state-change contract tests | Added, fresh rerun blocked by local Docker storage failure |
| Authenticated production issuer and recall roots | Missing, synthetic fixture only |
| Declare and execute the proof-bound action on Sepolia | Missing live wallet execution |

Do not describe this repository as end-to-end deployed, audited, production-safe, or backed by authenticated manufacturer data until those missing checks have fresh evidence.
