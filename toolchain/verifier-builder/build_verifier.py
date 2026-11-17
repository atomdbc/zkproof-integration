from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


GARAGA_COMMIT = "307c00af4a7f08653123d1ec9a6edae81f288260"


def run(command: list[str], cwd: Path | None = None) -> str:
    print("+", " ".join(command), flush=True)
    completed = subprocess.run(
        command,
        cwd=cwd,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    if completed.stdout:
        print(completed.stdout, end="", flush=True)
    if completed.returncode != 0:
        raise RuntimeError(
            f"Command failed with exit code {completed.returncode}: {' '.join(command)}"
        )
    return completed.stdout.strip()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, destination)


def main() -> None:
    project_name = os.environ["PROJECT_NAME"]
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,63}", project_name):
        raise ValueError("PROJECT_NAME must be lowercase snake case and at most 64 characters")

    verification_key = Path(
        os.environ.get("VERIFICATION_KEY", "/input/verification_key.json")
    ).resolve()
    output_directory = Path(os.environ["OUTPUT_DIRECTORY"]).resolve()
    if not verification_key.is_file():
        raise FileNotFoundError(f"Verification key not found at {verification_key}")

    output_directory.mkdir(parents=True, exist_ok=True)
    if any(output_directory.iterdir()):
        raise RuntimeError(f"Output directory must be empty: {output_directory}")

    Path(os.environ.get("HOME", "/tmp/starkcircom-home")).mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="starkcircom-builder-") as temporary:
        workspace = Path(temporary)
        run(
            [
                "garaga",
                "gen",
                "--system",
                "groth16",
                "--vk",
                str(verification_key),
                "--project-name",
                project_name,
                "--no-include-test-sample",
            ],
            cwd=workspace,
        )

        project = workspace / project_name
        manifest = project / "Scarb.toml"
        if not manifest.is_file():
            raise RuntimeError("Garaga did not produce a Scarb project")

        manifest_text = manifest.read_text()
        tag_reference = 'tag = "v1.1.0"'
        if tag_reference not in manifest_text:
            raise RuntimeError("Generated Scarb.toml does not contain the expected Garaga tag")
        manifest.write_text(
            manifest_text.replace(tag_reference, f'rev = "{GARAGA_COMMIT}"')
        )

        run(["scarb", "build"], cwd=project)

        target = project / "target" / "dev"
        sierra_candidates = [
            path
            for path in target.glob("*.contract_class.json")
            if not path.name.endswith(".compiled_contract_class.json")
        ]
        casm_candidates = list(target.glob("*.compiled_contract_class.json"))
        if len(sierra_candidates) != 1 or len(casm_candidates) != 1:
            raise RuntimeError(
                "Expected one Sierra and one CASM contract artifact, found "
                f"{len(sierra_candidates)} Sierra and {len(casm_candidates)} CASM"
            )

        source_files = [
            project / "Scarb.toml",
            project / "Scarb.lock",
            project / ".tool-versions",
            project / "src" / "lib.cairo",
            project / "src" / "groth16_verifier.cairo",
            project / "src" / "groth16_verifier_constants.cairo",
        ]
        for source in source_files:
            if source.is_file():
                relative = source.relative_to(project)
                copy_file(source, output_directory / "source" / relative)

        sierra_output = output_directory / "artifacts" / "sierra.json"
        casm_output = output_directory / "artifacts" / "casm.json"
        abi_output = output_directory / "artifacts" / "abi.json"
        copy_file(sierra_candidates[0], sierra_output)
        copy_file(casm_candidates[0], casm_output)

        sierra_json = json.loads(sierra_output.read_text())
        abi = sierra_json.get("abi", [])
        if isinstance(abi, str):
            abi = json.loads(abi)
        abi_output.write_text(json.dumps(abi, indent=2) + "\n")

    files: dict[str, dict[str, str]] = {}
    for path in sorted(output_directory.rglob("*")):
        if path.is_file():
            files[str(path.relative_to(output_directory))] = {"sha256": sha256(path)}

    build_output = {
        "schemaVersion": 1,
        "projectName": project_name,
        "proofSystem": "groth16",
        "curve": "bn254",
        "verificationKeySha256": sha256(verification_key),
        "toolchain": {
            "garaga": importlib.metadata.version("garaga"),
            "garagaCommit": GARAGA_COMMIT,
            "scarb": run(["scarb", "--version"]).splitlines()[0],
            "python": os.sys.version.split()[0],
        },
        "files": files,
    }
    (output_directory / "builder-output.json").write_text(
        json.dumps(build_output, indent=2, sort_keys=True) + "\n"
    )
    print(f"Verifier build completed in {output_directory}", flush=True)


if __name__ == "__main__":
    main()
