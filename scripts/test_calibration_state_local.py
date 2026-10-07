"""Run C6.1 calibration-state integration proof against LOCAL Supabase only."""
from functools import cache
from pathlib import Path
import subprocess

CONTAINER = "supabase_db_autofashion"
ROOT = Path(__file__).resolve().parents[1]
MIGRATION_VERSION = "20261007130000"


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
        raise RuntimeError("A local Docker socket is required; remote Docker contexts are refused")
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
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Local PostgreSQL command failed")
    return result.stdout.strip()


def main() -> None:
    applied = sql(
        "select exists(select 1 from supabase_migrations.schema_migrations "
        f"where version='{MIGRATION_VERSION}');"
    )
    if applied != "t":
        raise RuntimeError("Apply the C6.1 migration to LOCAL Supabase first")

    output = sql(
        (ROOT / "supabase/tests/calibration_state_machine.sql").read_text(
            encoding="utf-8"
        )
    )
    pass_lines = [line for line in output.splitlines() if line.startswith("PASS:")]
    if not pass_lines:
        raise RuntimeError("Local C6.1 calibration verification did not report success")

    print(pass_lines[-1])


if __name__ == "__main__":
    main()
