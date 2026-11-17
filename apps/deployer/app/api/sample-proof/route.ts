import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  generateGroth16Proof,
  prepareGroth16ProofForStarknet,
  verifyGroth16ProofLocal,
} from "@starkcircom/sdk";
import { loadCircuitBundle } from "@starkcircom/sdk/node";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectRoot(): string {
  const current = process.cwd();
  return existsSync(resolve(current, ".artifacts")) ? current : resolve(current, "../..");
}

export async function GET() {
  try {
    const root = projectRoot();
    const bundle = await loadCircuitBundle(
      resolve(root, ".artifacts/multiplier/manifest.json"),
    );
    const generated = await generateGroth16Proof({ a: 3, b: 11 }, bundle.artifacts);
    const valid = await verifyGroth16ProofLocal(
      bundle.verificationKey,
      generated.proof,
      generated.publicSignals,
    );
    if (!valid) throw new Error("The generated sample proof failed local verification.");

    const prepared = await prepareGroth16ProofForStarknet(
      bundle.verificationKey,
      generated.proof,
      generated.publicSignals,
    );

    return NextResponse.json(prepared, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Could not generate the sample proof.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
