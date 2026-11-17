import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const directory of [".artifacts", "dist", "coverage"]) {
  rmSync(resolve(root, directory), { recursive: true, force: true });
}
