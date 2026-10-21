"""Run the C6.4 end-to-end domain proof against local Supabase only."""

from functools import cache
from pathlib import Path
import subprocess

CONTAINER = "supabase_db_autofashion"
ROOT = Path(__file__).resolve().parents[1]
REQUIRED_MIGRATIONS = (
    "20261005180000",  # canonical one_piece domain
    "20261007113000",  # style-seed / ownership separation
    "20261007130000",  # adaptive calibration state machine
)


@cache
def local_docker_host() -> str:
    result = subprocess.run(
        ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
        text=True,
        capture_output=True,
        check=True,
        timeout=10,
    )
    host = result.stdout.strip()
    if not host.startswith(("npipe:////./pipe/", "unix:///")):
        raise RuntimeError(
            "A local Docker socket is required; remote Docker contexts are refused"
        )
    return host


def sql(statement: str) -> str:
    result = subprocess.run(
        [
            "docker",
            "--host",
            local_docker_host(),
            "exec",
            "-i",
            CONTAINER,
            "psql",
            "-X",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            "-Atq",
        ],
        input=statement,
        text=True,
        capture_output=True,
        timeout=90,
    )
    if result.returncode != 0:
        raise RuntimeError(
            result.stderr.strip()
            or result.stdout.strip()
            or "Local PostgreSQL command failed"
        )
    return result.stdout.strip()


def verify_migrations() -> None:
    versions = ",".join(f"'{version}'" for version in REQUIRED_MIGRATIONS)
    applied = sql(
        "select count(*)::text "
        "from supabase_migrations.schema_migrations "
        f"where version in ({versions});"
    )
    if applied != str(len(REQUIRED_MIGRATIONS)):
        raise RuntimeError(
            "C6.4 requires the local one-piece, style-seed separation, "
            "and C6.1 calibration migrations. Apply local migrations first. "
            "Do not use a linked/remote Supabase command."
        )


def main() -> None:
    verify_migrations()
    proof_path = ROOT / "supabase/tests/c6_end_to_end_flow.sql"
    output = sql(proof_path.read_text(encoding="utf-8"))
    pass_lines = [
        line.strip()
        for line in output.splitlines()
        if line.strip().startswith("PASS:")
    ]
    if not pass_lines:
        raise RuntimeError("C6.4 local verification did not report success")
    print(pass_lines[-1])


if __name__ == "__main__":
    main()
