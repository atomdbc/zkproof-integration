import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadCircuitBundle, loadVerifierBuild } from "@starkcircom/sdk/node";
import { hash } from "starknet";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectRoot(): string {
  const current = process.cwd();
  return existsSync(resolve(current, ".artifacts")) ? current : resolve(current, "../..");
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function GET() {
  try {
    const root = projectRoot();
    const circuitManifestFile = resolve(root, ".artifacts/recall_action/manifest.json");
    const verificationKeyFile = resolve(root, ".artifacts/recall_action/verification_key.json");
    const verifierManifestFile = resolve(
      root,
      ".artifacts/verifiers/recall_action_verifier/manifest.json",
    );
    const contractsRoot = resolve(root, ".artifacts/contracts/proof_actions");
    const contractsManifestFile = resolve(contractsRoot, "manifest.json");

    const [circuit, verifier, verifierManifestBytes, contractsManifestText] = await Promise.all([
      loadCircuitBundle(circuitManifestFile),
      loadVerifierBuild(verifierManifestFile, { verificationKeyFile }),
      readFile(verifierManifestFile),
      readFile(contractsManifestFile, "utf8"),
    ]);
    const contractsManifest = JSON.parse(contractsManifestText) as {
      contracts: Record<
        string,
        {
          classHash: string;
          compiledClassHash: string;
          files: Record<string, { path: string; sha256: string }>;
        }
      >;
    };

    const contracts: Record<string, unknown> = {};
    for (const [name, metadata] of Object.entries(contractsManifest.contracts)) {
      const loaded: Record<string, unknown> = {};
      for (const [kind, file] of Object.entries(metadata.files)) {
        const bytes = await readFile(resolve(contractsRoot, file.path));
        if (sha256(bytes) !== file.sha256) {
          throw new Error(`${name} ${kind} failed its artifact hash check.`);
        }
        loaded[kind] = JSON.parse(bytes.toString("utf8"));
      }
      const sierra = loaded.sierra as Parameters<typeof hash.computeContractClassHash>[0];
      const casm = loaded.casm as Parameters<typeof hash.computeCompiledClassHash>[0];
      if (
        hash.computeContractClassHash(sierra) !== metadata.classHash ||
        hash.computeCompiledClassHash(casm) !== metadata.compiledClassHash
      ) {
        throw new Error(`${name} class hashes do not match its manifest.`);
      }
      contracts[name] = { ...metadata, ...loaded };
    }

    return NextResponse.json(
      {
        circuitManifest: circuit.manifest,
        verificationKey: circuit.verificationKey,
        provingArtifacts: {
          wasm: "/api/action/proving/wasm",
          zkey: "/api/action/proving/zkey",
        },
        verifier: {
          manifest: verifier.manifest,
          sierra: verifier.sierra,
          casm: verifier.casm,
          abi: verifier.abi,
        },
        manifestCommitment: `0x${sha256(verifierManifestBytes).slice(0, 62)}`,
        contractsManifest,
        contracts,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load proof-action artifacts." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
