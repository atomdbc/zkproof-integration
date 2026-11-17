import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "starknet";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};

const useLocalToolchain = args.includes("--local");
const projectName = option("--name", "multiplier_verifier");
if (!/^[a-z][a-z0-9_]{0,63}$/u.test(projectName)) {
  throw new Error("--name must be lowercase snake case and at most 64 characters");
}

const verificationKeyPath = resolve(
  option("--vk", join(root, ".artifacts", "multiplier", "verification_key.json")),
);
const outputDirectory = resolve(
  option("--output", join(root, ".artifacts", "verifiers", projectName)),
);
const image = option("--image", "starkcircom-verifier-builder:garaga-1.1.0-scarb-2.16.1");
const dockerfileDirectory = join(root, "toolchain", "verifier-builder");

if (!existsSync(verificationKeyPath)) {
  throw new Error(`Verification key not found at ${verificationKeyPath}. Run npm run circuit:build first.`);
}

const run = (command, commandArgs, options = {}) =>
  execFileSync(command, commandArgs, { cwd: root, stdio: "inherit", ...options });
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

if (useLocalToolchain) {
  const pythonVersion = execFileSync("python", ["--version"], { encoding: "utf8" }).trim();
  const scarbVersion = execFileSync("scarb", ["--version"], { encoding: "utf8" }).trim();
  const garagaVersion = execFileSync(
    "python",
    ["-c", "import importlib.metadata; print(importlib.metadata.version('garaga'))"],
    { encoding: "utf8" },
  ).trim();
  if (!pythonVersion.startsWith("Python 3.12.") || !scarbVersion.includes("scarb 2.16.1") || garagaVersion !== "1.1.0") {
    throw new Error(`Local toolchain mismatch: ${pythonVersion}, ${scarbVersion.split("\n")[0]}, Garaga ${garagaVersion}.`);
  }
  console.log("Generating and compiling with verified local Garaga 1.1.0 and Scarb 2.16.1.");
  run("python", [join(dockerfileDirectory, "build_verifier.py")], {
    env: {
      ...process.env,
      HOME: resolve("/tmp", "starkcircom-local-home"),
      PROJECT_NAME: projectName,
      VERIFICATION_KEY: verificationKeyPath,
      OUTPUT_DIRECTORY: outputDirectory,
    },
  });
} else {
  console.log(`Building pinned verifier image ${image}.`);
  run("docker", [
    "build",
    "--build-arg",
    "GARAGA_VERSION=1.1.0",
    "--build-arg",
    "SCARB_VERSION=2.16.1",
    "--tag",
    image,
    dockerfileDirectory,
  ]);
  const dockerArgs = ["run", "--rm"];
  if (typeof process.getuid === "function" && typeof process.getgid === "function") {
    dockerArgs.push("--user", `${process.getuid()}:${process.getgid()}`);
  }
  dockerArgs.push(
    "--env",
    "HOME=/tmp/starkcircom-home",
    "--env",
    `PROJECT_NAME=${projectName}`,
    "--env",
    `VERIFICATION_KEY=/input/${basename(verificationKeyPath)}`,
    "--mount",
    `type=bind,src=${dirname(verificationKeyPath)},dst=/input,readonly`,
    "--mount",
    `type=bind,src=${outputDirectory},dst=/output`,
    image,
  );
  console.log("Generating and compiling the Cairo verifier in Docker.");
  run("docker", dockerArgs);
}

const builderOutputPath = join(outputDirectory, "builder-output.json");
const builderOutput = JSON.parse(readFileSync(builderOutputPath, "utf8"));
const expectedVerificationKeyHash = sha256(verificationKeyPath);
if (builderOutput.verificationKeySha256 !== expectedVerificationKeyHash) {
  throw new Error("The builder used a different verification key than the requested input.");
}

for (const [file, metadata] of Object.entries(builderOutput.files)) {
  const path = resolve(outputDirectory, file);
  const pathFromOutput = relative(outputDirectory, path);
  if (pathFromOutput.startsWith("..")) throw new Error(`Builder emitted unsafe file path ${file}.`);
  if (!existsSync(path)) throw new Error(`Builder output is missing ${file}.`);
  if (sha256(path) !== metadata.sha256) throw new Error(`Builder output hash mismatch for ${file}.`);
}

const sierraPath = join(outputDirectory, "artifacts", "sierra.json");
const casmPath = join(outputDirectory, "artifacts", "casm.json");
const sierra = JSON.parse(readFileSync(sierraPath, "utf8"));
const casm = JSON.parse(readFileSync(casmPath, "utf8"));

const manifest = {
  schemaVersion: 1,
  projectName,
  proofSystem: "groth16",
  curve: "bn254",
  verificationKeySha256: expectedVerificationKeyHash,
  entrypoint: "verify_groth16_proof_bn254",
  classHash: hash.computeContractClassHash(sierra),
  compiledClassHash: hash.computeCompiledClassHash(casm),
  toolchain: builderOutput.toolchain,
  files: {
    ...builderOutput.files,
    "builder-output.json": { sha256: sha256(builderOutputPath) },
  },
};

const manifestPath = join(outputDirectory, "manifest.json");
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Verifier manifest written to ${relative(root, manifestPath)}.`);
console.log(`Class hash ${manifest.classHash}`);
console.log(`Compiled class hash ${manifest.compiledClassHash}`);
