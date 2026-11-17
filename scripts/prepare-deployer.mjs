import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "starknet";
import { loadVerifierBuild } from "../dist/node.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (script) => {
  const result = spawnSync("npm", ["run", script], { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const verifiers = [
  {
    label: "Multiplier verifier",
    manifest: ".artifacts/verifiers/multiplier_verifier/manifest.json",
    verificationKey: ".artifacts/multiplier/verification_key.json",
    build: "verifier:build",
  },
  {
    label: "Recall-action verifier",
    manifest: ".artifacts/verifiers/recall_action_verifier/manifest.json",
    verificationKey: ".artifacts/recall_action/verification_key.json",
    build: "action:verifier:build",
  },
];

for (const verifier of verifiers) {
  try {
    await loadVerifierBuild(resolve(root, verifier.manifest), {
      verificationKeyFile: resolve(root, verifier.verificationKey),
    });
    console.log(`${verifier.label} artifacts are current.`);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.log(`${verifier.label} artifacts need to be built. ${reason}`);
    run(verifier.build);
  }
}

async function checkContracts() {
  const artifactRoot = resolve(root, ".artifacts/contracts/proof_actions");
  const manifest = JSON.parse(await readFile(resolve(artifactRoot, "manifest.json"), "utf8"));
  for (const [source, metadata] of Object.entries(manifest.sources)) {
    const bytes = await readFile(resolve(artifactRoot, "source", source));
    if (sha256(bytes) !== metadata.sha256) throw new Error(`${source} source hash mismatch.`);
  }
  for (const [name, contract] of Object.entries(manifest.contracts)) {
    const loaded = {};
    for (const [kind, file] of Object.entries(contract.files)) {
      const bytes = await readFile(resolve(artifactRoot, file.path));
      if (sha256(bytes) !== file.sha256) throw new Error(`${name} ${kind} hash mismatch.`);
      loaded[kind] = JSON.parse(bytes.toString("utf8"));
    }
    if (
      hash.computeContractClassHash(loaded.sierra) !== contract.classHash ||
      hash.computeCompiledClassHash(loaded.casm) !== contract.compiledClassHash
    ) throw new Error(`${name} class hash mismatch.`);
  }
}

try {
  await checkContracts();
  console.log("Proof-action contract artifacts are current.");
} catch (cause) {
  const reason = cause instanceof Error ? cause.message : String(cause);
  console.log(`Proof-action contracts need to be built. ${reason}`);
  run("contracts:build");
  await checkContracts();
}
