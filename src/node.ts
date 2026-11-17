import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { hash } from "starknet";
import { StarkCircomError } from "./errors.js";
import type {
  CircuitManifest,
  Groth16VerificationKey,
  LoadedCircuitBundle,
  LoadedVerifierBuild,
  ManifestArtifact,
  VerifierBuildManifest,
} from "./types.js";
import { assertGroth16VerificationKey } from "./validation.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertArtifact(value: unknown, name: string): asserts value is ManifestArtifact {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    !/^[a-f0-9]{64}$/u.test(String(value.sha256))
  ) {
    throw new StarkCircomError("INVALID_MANIFEST", `Manifest artifact ${name} is invalid.`);
  }
}

function assertCircuitManifest(value: unknown): asserts value is CircuitManifest {
  if (!isRecord(value)) {
    throw new StarkCircomError("INVALID_MANIFEST", "The circuit manifest must be a JSON object.");
  }
  if (value.schemaVersion !== 1 || value.proofSystem !== "groth16" || value.curve !== "bn254") {
    throw new StarkCircomError(
      "INVALID_MANIFEST",
      "The circuit manifest must use schema version 1, Groth16, and BN254.",
    );
  }
  if (!isRecord(value.artifacts)) {
    throw new StarkCircomError("INVALID_MANIFEST", "The manifest is missing its artifacts object.");
  }
  for (const name of ["wasm", "r1cs", "zkey", "verificationKey"] as const) {
    assertArtifact(value.artifacts[name], name);
  }
  if (!Array.isArray(value.publicSignals)) {
    throw new StarkCircomError("INVALID_MANIFEST", "The manifest is missing its public signal schema.");
  }
}

function assertVerifierBuildManifest(value: unknown): asserts value is VerifierBuildManifest {
  if (!isRecord(value)) {
    throw new StarkCircomError("INVALID_MANIFEST", "The verifier manifest must be a JSON object.");
  }
  if (value.schemaVersion !== 1 || value.proofSystem !== "groth16" || value.curve !== "bn254") {
    throw new StarkCircomError(
      "INVALID_MANIFEST",
      "The verifier manifest must use schema version 1, Groth16, and BN254.",
    );
  }
  for (const name of ["verificationKeySha256", "classHash", "compiledClassHash"] as const) {
    if (typeof value[name] !== "string") {
      throw new StarkCircomError("INVALID_MANIFEST", `The verifier manifest has no valid ${name}.`);
    }
  }
  if (!isRecord(value.files)) {
    throw new StarkCircomError("INVALID_MANIFEST", "The verifier manifest has no file hashes.");
  }
  for (const [name, metadata] of Object.entries(value.files)) {
    if (!isRecord(metadata) || !/^[a-f0-9]{64}$/u.test(String(metadata.sha256))) {
      throw new StarkCircomError("INVALID_MANIFEST", `Verifier file metadata is invalid for ${name}.`);
    }
  }
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function resolveArtifactPath(manifestDirectory: string, artifact: ManifestArtifact): string {
  if (isAbsolute(artifact.path)) {
    throw new StarkCircomError("INVALID_MANIFEST", "Artifact paths must be relative to the manifest.");
  }
  const path = resolve(manifestDirectory, artifact.path);
  const pathFromManifest = relative(manifestDirectory, path);
  if (pathFromManifest.startsWith("..") || isAbsolute(pathFromManifest)) {
    throw new StarkCircomError("INVALID_MANIFEST", "An artifact path escapes the manifest directory.");
  }
  return path;
}

export async function loadCircuitBundle(manifestFile: string): Promise<LoadedCircuitBundle> {
  const manifestPath = resolve(manifestFile);
  const manifestDirectory = dirname(manifestPath);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (cause) {
    throw new StarkCircomError("INVALID_MANIFEST", `Could not read manifest ${manifestPath}.`, {
      cause,
    });
  }
  assertCircuitManifest(parsed);

  const paths = {
    wasm: resolveArtifactPath(manifestDirectory, parsed.artifacts.wasm),
    r1cs: resolveArtifactPath(manifestDirectory, parsed.artifacts.r1cs),
    zkey: resolveArtifactPath(manifestDirectory, parsed.artifacts.zkey),
    verificationKey: resolveArtifactPath(manifestDirectory, parsed.artifacts.verificationKey),
  };

  for (const name of Object.keys(paths) as Array<keyof typeof paths>) {
    let actualHash: string;
    try {
      actualHash = await sha256(paths[name]);
    } catch (cause) {
      throw new StarkCircomError(
        "INVALID_ARTIFACT",
        `Could not read the ${name} artifact referenced by the manifest.`,
        { cause },
      );
    }
    if (actualHash !== parsed.artifacts[name].sha256) {
      throw new StarkCircomError(
        "INVALID_ARTIFACT",
        `The ${name} artifact does not match its manifest hash.`,
      );
    }
  }

  let verificationKey: unknown;
  try {
    verificationKey = JSON.parse(await readFile(paths.verificationKey, "utf8"));
  } catch (cause) {
    throw new StarkCircomError("INVALID_ARTIFACT", "The verification key is not valid JSON.", {
      cause,
    });
  }
  assertGroth16VerificationKey(verificationKey);
  if (verificationKey.nPublic !== parsed.publicSignals.length) {
    throw new StarkCircomError(
      "INVALID_MANIFEST",
      "The public signal schema does not match the verification key.",
    );
  }

  return {
    manifest: parsed,
    verificationKey: verificationKey as Groth16VerificationKey,
    artifacts: {
      wasm: paths.wasm,
      zkey: paths.zkey,
    },
  };
}

export async function loadVerifierBuild(
  manifestFile: string,
  options: { verificationKeyFile?: string } = {},
): Promise<LoadedVerifierBuild> {
  const manifestPath = resolve(manifestFile);
  const manifestDirectory = dirname(manifestPath);

  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (cause) {
    throw new StarkCircomError("INVALID_MANIFEST", `Could not read verifier manifest ${manifestPath}.`, {
      cause,
    });
  }
  assertVerifierBuildManifest(parsed);

  for (const [name, metadata] of Object.entries(parsed.files)) {
    const artifactPath = resolveArtifactPath(manifestDirectory, { path: name, sha256: metadata.sha256 });
    let actualHash: string;
    try {
      actualHash = await sha256(artifactPath);
    } catch (cause) {
      throw new StarkCircomError("INVALID_ARTIFACT", `Could not read verifier file ${name}.`, {
        cause,
      });
    }
    if (actualHash !== metadata.sha256) {
      throw new StarkCircomError("INVALID_ARTIFACT", `Verifier file ${name} failed its hash check.`);
    }
  }

  if (options.verificationKeyFile) {
    const keyHash = await sha256(resolve(/* turbopackIgnore: true */ options.verificationKeyFile));
    if (keyHash !== parsed.verificationKeySha256) {
      throw new StarkCircomError(
        "INVALID_ARTIFACT",
        "The verifier was built from a different verification key.",
      );
    }
  }

  const readJson = async (name: string): Promise<unknown> => {
    try {
      return JSON.parse(await readFile(resolve(manifestDirectory, name), "utf8"));
    } catch (cause) {
      throw new StarkCircomError("INVALID_ARTIFACT", `Verifier file ${name} is not valid JSON.`, {
        cause,
      });
    }
  };

  const sierra = (await readJson("artifacts/sierra.json")) as LoadedVerifierBuild["sierra"];
  const casm = (await readJson("artifacts/casm.json")) as LoadedVerifierBuild["casm"];
  const abi = (await readJson("artifacts/abi.json")) as LoadedVerifierBuild["abi"];
  const classHash = hash.computeContractClassHash(sierra);
  const compiledClassHash = hash.computeCompiledClassHash(casm);

  if (classHash !== parsed.classHash || compiledClassHash !== parsed.compiledClassHash) {
    throw new StarkCircomError(
      "INVALID_ARTIFACT",
      "The verifier class hashes do not match the compiled artifacts.",
    );
  }

  return {
    manifest: parsed,
    sierra,
    casm,
    abi,
    declaration: {
      contract: sierra,
      casm,
      classHash,
      compiledClassHash,
    },
  };
}
