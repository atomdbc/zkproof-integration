import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const sourcePath = join(root, "circuits", "recall_action.circom");
const dependencyPaths = [
  join(root, "node_modules", "circomlib", "circuits", "comparators.circom"),
  join(root, "node_modules", "circomlib", "circuits", "bitify.circom"),
  join(root, "node_modules", "circomlib", "circuits", "poseidon.circom"),
  join(root, "node_modules", "circomlib", "circuits", "poseidon_constants.circom"),
];
const ptauPath = join(root, "circuit", "powersOfTau28_hez_final_14.ptau");
const outputDir = join(root, ".artifacts", "recall_action");
const manifestPath = join(outputDir, "manifest.json");
const baseName = "recall_action";

for (const path of [sourcePath, ptauPath, ...dependencyPaths]) {
  if (!existsSync(path)) throw new Error(`Required circuit input not found at ${path}`);
}

const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceHash = hashFile(sourcePath);
const ptauHash = hashFile(ptauPath);
const dependencies = dependencyPaths.map((path) => ({
  path: relative(root, path),
  sha256: hashFile(path),
}));

function readPackageVersion(name) {
  return JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8")).version;
}

function cacheIsValid() {
  if (force || !existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.circuit.sourceSha256 !== sourceHash || manifest.setup.ptauSha256 !== ptauHash) {
      return false;
    }
    if (JSON.stringify(manifest.circuit.dependencies) !== JSON.stringify(dependencies)) return false;
    for (const artifact of Object.values(manifest.artifacts)) {
      const path = join(outputDir, artifact.path);
      if (!existsSync(path) || hashFile(path) !== artifact.sha256) return false;
    }
    return true;
  } catch {
    return false;
  }
}

if (cacheIsValid()) {
  console.log("Recall action circuit artifacts are current.");
  process.exit(0);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const bin = (name) => join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? `${name}.cmd` : name,
);
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });

console.log("Building the proof-bound recall action circuit.");
console.log("The generated circuit-specific contribution is for development only.");
run(bin("circom2"), [sourcePath, "--r1cs", "--wasm", "--sym", "--inspect", "-o", outputDir]);

const r1csPath = join(outputDir, `${baseName}.r1cs`);
const initialZkeyPath = join(outputDir, `${baseName}_0000.zkey`);
const finalZkeyPath = join(outputDir, `${baseName}_final.zkey`);
const verificationKeyPath = join(outputDir, "verification_key.json");

run(bin("snarkjs"), ["groth16", "setup", r1csPath, ptauPath, initialZkeyPath]);
run(bin("snarkjs"), [
  "zkey",
  "contribute",
  initialZkeyPath,
  finalZkeyPath,
  "--name=local-development-contribution",
  `--entropy=${randomBytes(32).toString("hex")}`,
]);
run(bin("snarkjs"), ["zkey", "verify", r1csPath, ptauPath, finalZkeyPath]);
run(bin("snarkjs"), ["zkey", "export", "verificationkey", finalZkeyPath, verificationKeyPath]);
rmSync(initialZkeyPath, { force: true });

const artifact = (path) => ({ path: relative(outputDir, path), sha256: hashFile(path) });
const publicSignalNames = [
  "protocolVersion",
  "chainId",
  "consumer",
  "actionId",
  "policyVersion",
  "actor",
  "policyHash",
  "expiresAt",
  "nullifier",
  "claimTier",
  "issuedRoot",
  "affectedRoot",
];

const manifest = {
  schemaVersion: 1,
  proofSystem: "groth16",
  curve: "bn254",
  circuit: {
    name: "recall_action",
    source: relative(root, sourcePath),
    sourceSha256: sourceHash,
    dependencies,
  },
  publicSignals: publicSignalNames.map((name, index) => ({ name, index, type: "field" })),
  setup: {
    purpose: "development-only",
    ptau: relative(root, ptauPath),
    ptauSha256: ptauHash,
  },
  toolchain: {
    circom2: readPackageVersion("circom2"),
    circomlib: readPackageVersion("circomlib"),
    snarkjs: readPackageVersion("snarkjs"),
  },
  artifacts: {
    wasm: artifact(join(outputDir, `${baseName}_js`, `${baseName}.wasm`)),
    r1cs: artifact(r1csPath),
    zkey: artifact(finalZkeyPath),
    verificationKey: artifact(verificationKeyPath),
  },
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${relative(root, manifestPath)}.`);
