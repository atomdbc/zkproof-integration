import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const image = "starkcircom-contract-tests:snforge-0.57.0-scarb-2.16.1";
const context = join(root, "toolchain", "contract-tests");
const project = join(root, "contracts", "proof_actions");

const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: "inherit" });

console.log(`Building pinned contract-test image ${image}.`);
run("docker", ["build", "--tag", image, context]);
console.log("Running proof-action contract tests in Docker.");
run("docker", [
  "run",
  "--rm",
  "--volume",
  "starkcircom-contract-test-cache:/root/.cache/scarb",
  "--volume",
  `${project}:/project`,
  image,
]);
