import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadVerifierBuild } from "@starkcircom/sdk/node";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectRoot(): string {
  const current = process.cwd();
  return existsSync(resolve(current, ".artifacts")) ? current : resolve(current, "../..");
}

export async function GET() {
  const root = projectRoot();
  try {
    const verifier = await loadVerifierBuild(
      resolve(root, ".artifacts/verifiers/multiplier_verifier/manifest.json"),
      { verificationKeyFile: resolve(root, ".artifacts/multiplier/verification_key.json") },
    );

    return NextResponse.json(
      {
        manifest: verifier.manifest,
        sierra: verifier.sierra,
        casm: verifier.casm,
        abi: verifier.abi,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The verifier artifacts could not be loaded.",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
