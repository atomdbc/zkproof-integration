import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function projectRoot(): string {
  const current = process.cwd();
  return existsSync(resolve(current, ".artifacts")) ? current : resolve(current, "../..");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string }> },
) {
  const { kind } = await params;
  const files: Record<string, { path: string; contentType: string }> = {
    wasm: {
      path: ".artifacts/recall_action/recall_action_js/recall_action.wasm",
      contentType: "application/wasm",
    },
    zkey: {
      path: ".artifacts/recall_action/recall_action_final.zkey",
      contentType: "application/octet-stream",
    },
  };
  const selected = files[kind];
  if (!selected) return NextResponse.json({ error: "Unknown proving artifact." }, { status: 404 });

  try {
    const bytes = await readFile(
      /* turbopackIgnore: true */ resolve(projectRoot(), selected.path),
    );
    return new Response(bytes, {
      headers: {
        "Cache-Control": "private, max-age=3600",
        "Content-Type": selected.contentType,
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not read proving artifact." },
      { status: 500 },
    );
  }
}
