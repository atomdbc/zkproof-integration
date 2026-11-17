import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { finished } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ceremonies = {
  "12": {
    file: "powersOfTau28_hez_final_12.ptau",
    blake2b512: "ded2694169b7b08e898f736d5de95af87c3f1a64594013351b1a796dbee393bd825f88f9468c84505ddd11eb0b1465ac9b43b9064aa8ec97f2b73e04758b8a4a",
  },
  "14": {
    file: "powersOfTau28_hez_final_14.ptau",
    blake2b512: "eeefbcf7c3803b523c94112023c7ff89558f9b8e0cf5d6cdcba3ade60f168af4a181c9c21774b94fbae6c90411995f7d854d02ebd93fb66043dbb06f17a831c1",
  },
};

const requested = process.argv.slice(2);
if (requested.length === 0 || requested.some((power) => !(power in ceremonies))) {
  throw new Error("Usage: node scripts/fetch-ptau.mjs <12|14> [12|14]");
}

const blake2b = (path) => createHash("blake2b512").update(readFileSync(path)).digest("hex");

for (const power of requested) {
  const ceremony = ceremonies[power];
  const destination = join(root, "circuit", ceremony.file);
  if (existsSync(destination) && blake2b(destination) === ceremony.blake2b512) {
    console.log(`${ceremony.file} is current.`);
    continue;
  }

  mkdirSync(dirname(destination), { recursive: true });
  const temporary = `${destination}.download`;
  rmSync(temporary, { force: true });
  const url = `https://circom.info/${ceremony.file}`;
  console.log(`Downloading ${url}.`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) {
    throw new Error(`Could not download ${url}. HTTP ${response.status}.`);
  }
  await finished(Readable.fromWeb(response.body).pipe(createWriteStream(temporary)));
  const actual = blake2b(temporary);
  if (actual !== ceremony.blake2b512) {
    rmSync(temporary, { force: true });
    throw new Error(`BLAKE2b-512 mismatch for ${ceremony.file}.`);
  }
  renameSync(temporary, destination);
  console.log(`Verified ${ceremony.file}.`);
}
