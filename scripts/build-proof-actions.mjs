import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "starknet";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = join(root, "contracts", "proof_actions");
const target = join(project, "target", "dev");
const output = join(root, ".artifacts", "contracts", "proof_actions");
const image = "starkcircom-verifier-builder:garaga-1.1.0-scarb-2.16.1";
const dockerContext = join(root, "toolchain", "verifier-builder");
const useLocalScarb = process.argv.includes("--local");
const sourceFiles = [
  "Scarb.toml",
  "src/lib.cairo",
  "src/proof_action_consumer.cairo",
  "src/verifier_registry.cairo",
];

const run = (command, args, cwd = root) => execFileSync(command, args, {
  cwd,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
const sha256 = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

let scarbVersion;
if (useLocalScarb) {
  scarbVersion = run("scarb", ["--version"], project).trim().split("\n")[0];
  if (!scarbVersion.includes("scarb 2.16.1")) {
    throw new Error(`Local build requires Scarb 2.16.1, received ${scarbVersion}.`);
  }
  console.log("Compiling proof-action contracts with verified local Scarb 2.16.1.");
  execFileSync("scarb", ["build"], { cwd: project, stdio: "inherit" });
} else {
  try {
    run("docker", ["image", "inspect", image]);
  } catch {
    console.log(`Building pinned verifier image ${image}.`);
    run("docker", ["build", "--tag", image, dockerContext]);
  }
  console.log("Compiling proof-action Cairo contracts in the pinned container.");
  const dockerArgs = [
    "run",
    "--rm",
    "--entrypoint",
    "scarb",
    "--volume",
    `${project}:/project`,
    "--workdir",
    "/project",
    image,
    "build",
  ];
  execFileSync("docker", dockerArgs, { cwd: root, stdio: "inherit" });
  scarbVersion = run(
    "docker",
    ["run", "--rm", "--entrypoint", "scarb", image, "--version"],
  ).trim().split("\n")[0];
}

const index = JSON.parse(
  readFileSync(join(target, "starkcircom_proof_actions.starknet_artifacts.json"), "utf8"),
);
rmSync(output, { recursive: true, force: true });
mkdirSync(join(output, "artifacts"), { recursive: true });
mkdirSync(join(output, "source", "src"), { recursive: true });

const contracts = {};
for (const contract of index.contracts) {
  const name = contract.contract_name;
  const prefix = name.replace(/([a-z0-9])([A-Z])/gu, "$1_$2").toLowerCase();
  const sierraSource = join(target, contract.artifacts.sierra);
  const casmSource = join(target, contract.artifacts.casm);
  const sierraDestination = join(output, "artifacts", `${prefix}.sierra.json`);
  const casmDestination = join(output, "artifacts", `${prefix}.casm.json`);
  const abiDestination = join(output, "artifacts", `${prefix}.abi.json`);
  cpSync(sierraSource, sierraDestination);
  cpSync(casmSource, casmDestination);
  const sierra = JSON.parse(readFileSync(sierraDestination, "utf8"));
  const casm = JSON.parse(readFileSync(casmDestination, "utf8"));
  const abi = typeof sierra.abi === "string" ? JSON.parse(sierra.abi) : sierra.abi;
  writeFileSync(abiDestination, `${JSON.stringify(abi, null, 2)}\n`);
  contracts[name] = {
    modulePath: contract.module_path,
    classHash: hash.computeContractClassHash(sierra),
    compiledClassHash: hash.computeCompiledClassHash(casm),
    files: {
      sierra: { path: relative(output, sierraDestination), sha256: sha256(sierraDestination) },
      casm: { path: relative(output, casmDestination), sha256: sha256(casmDestination) },
      abi: { path: relative(output, abiDestination), sha256: sha256(abiDestination) },
    },
  };
}

for (const file of sourceFiles) {
  const source = join(project, file);
  if (!existsSync(source)) throw new Error(`Missing contract source ${source}`);
  const destination = join(output, "source", file);
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(source, destination);
}
if (existsSync(join(project, "Scarb.lock"))) {
  cpSync(join(project, "Scarb.lock"), join(output, "source", "Scarb.lock"));
}

const sources = {};
for (const file of [...sourceFiles, ...(existsSync(join(project, "Scarb.lock")) ? ["Scarb.lock"] : [])]) {
  const path = join(output, "source", file);
  sources[file] = { sha256: sha256(path) };
}
const manifest = {
  schemaVersion: 1,
  projectName: "starkcircom_proof_actions",
  toolchain: { scarb: scarbVersion, cairo: "2.16.1" },
  sources,
  contracts,
};
writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Proof-action contract manifest written to ${relative(root, join(output, "manifest.json"))}.`);
for (const [name, contract] of Object.entries(contracts)) {
  console.log(`${name} class hash ${contract.classHash}`);
}
