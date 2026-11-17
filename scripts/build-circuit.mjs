import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const ptauArgIndex = process.argv.indexOf("--ptau");
const sourcePath = join(root, "circuit", "circuit.circom");
const ptauPath = ptauArgIndex >= 0
  ? resolve(process.argv[ptauArgIndex + 1] ?? "")
  : join(root, "circuit", "powersOfTau28_hez_final_12.ptau");
const outputDir = join(root, ".artifacts", "multiplier");
const manifestPath = join(outputDir, "manifest.json");

if (!existsSync(sourcePath)) throw new Error(`Circuit source not found at ${sourcePath}`);
if (!existsSync(ptauPath)) throw new Error(`PTAU file not found at ${ptauPath}`);

const hashFile = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceHash = hashFile(sourcePath);
const ptauHash = hashFile(ptauPath);

function readPackageVersion(name) {
  const path = join(root, "node_modules", name, "package.json");
  return JSON.parse(readFileSync(path, "utf8")).version;
}

function cacheIsValid() {
  if (force || !existsSync(manifestPath)) return false;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.circuit.sourceSha256 !== sourceHash || manifest.setup.ptauSha256 !== ptauHash) {
      return false;
    }
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
  console.log("Circuit artifacts are current.");
  process.exit(0);
}

rmSync(outputDir, { recursive: true, force: true });
mkdirSync(outputDir, { recursive: true });

const bin = (name) => join(root, "node_modules", ".bin", process.platform === "win32" ? `${name}.cmd` : name);
const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });

console.log("Building the development multiplier circuit.");
console.log("The bundled PTAU and generated contribution are for development only.");

run(bin("circom2"), [sourcePath, "--r1cs", "--wasm", "--sym", "-o", outputDir]);

const r1csPath = join(outputDir, "circuit.r1cs");
const initialZkeyPath = join(outputDir, "circuit_0000.zkey");
const finalZkeyPath = join(outputDir, "circuit_final.zkey");
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

const artifact = (path) => ({
  path: relative(outputDir, path),
  sha256: hashFile(path),
});

const manifest = {
  schemaVersion: 1,
  proofSystem: "groth16",
  curve: "bn254",
  circuit: {
    name: "multiplier",
    source: relative(root, sourcePath),
    sourceSha256: sourceHash,
  },
  publicSignals: [
    { name: "product", index: 0, type: "field" },
  ],
  setup: {
    purpose: "development-only",
    ptau: relative(root, ptauPath),
    ptauSha256: ptauHash,
  },
  toolchain: {
    circom2: readPackageVersion("circom2"),
    snarkjs: readPackageVersion("snarkjs"),
  },
  artifacts: {
    wasm: artifact(join(outputDir, "circuit_js", "circuit.wasm")),
    r1cs: artifact(r1csPath),
    zkey: artifact(finalZkeyPath),
    verificationKey: artifact(verificationKeyPath),
  },
};

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${relative(root, manifestPath)}.`);
