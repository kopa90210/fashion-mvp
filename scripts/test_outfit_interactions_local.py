"""Local Docker SQL/RLS and concurrent replay tests. Never loads environment files."""
from concurrent.futures import ThreadPoolExecutor
from functools import cache
from pathlib import Path
import subprocess
from threading import Barrier
from uuid import uuid4

CONTAINER = "supabase_db_autofashion"
ROOT = Path(__file__).resolve().parents[1]


@cache
def local_docker_host() -> str:
    result = subprocess.run(
        ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
        text=True, capture_output=True, check=True, timeout=10,
    )
    host = result.stdout.strip()
    if not host.startswith(("npipe:////./pipe/", "unix:///")):
        raise RuntimeError("A local Docker socket is required; remote Docker contexts are refused")
    return host


def sql(statement: str) -> str:
    result = subprocess.run(
        ["docker", "--host", local_docker_host(), "exec", "-i", CONTAINER, "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"],
        input=statement, text=True, capture_output=True, check=True, timeout=60,
    )
    return result.stdout.strip()


def main() -> None:
    # Fixed local container/database; no host, URL, password, or remote flags accepted.
    if sql("select to_regclass('public.outfit_interactions') is not null;") != "t":
        raise RuntimeError("Apply the new migration to local Supabase first")
    sql((ROOT / "supabase/tests/outfit_interactions.sql").read_text(encoding="utf-8"))
    print("PASS: transactional SQL/RLS and preference isolation tests")

    user_id, outfit_id = str(uuid4()), str(uuid4())
    sql(f"""begin;
      insert into auth.users(id,email) values('{user_id}','{user_id}@be1.local.test');
      insert into public.users(id) values('{user_id}') on conflict do nothing;
      insert into public.outfits(id,user_id,source) values('{outfit_id}','{user_id}','engine');
      commit;""")
    try:
        barrier = Barrier(2)

        def replay() -> str:
            barrier.wait(timeout=10)
            return sql(f"""begin;
              set local role authenticated;
              set local request.jwt.claim.sub = '{user_id}';
              select public.record_outfit_interaction('{outfit_id}','outfit_worn','concurrent-key');
              do $$ begin perform pg_sleep(0.2); end $$;
              commit;""")

        with ThreadPoolExecutor(max_workers=2) as executor:
            first = executor.submit(replay)
            second = executor.submit(replay)
            if first.result() != second.result():
                raise AssertionError("Concurrent replay returned different event IDs")
        if sql(f"select count(*) from public.outfit_interactions where user_id='{user_id}';") != "1":
            raise AssertionError("Concurrent retry created duplicate events")
        print("PASS: concurrent duplicate requests return one persisted event")
    finally:
        # Remove only the randomly generated fixture user created by this run.
        sql(f"delete from auth.users where id='{user_id}';")


if __name__ == "__main__":
    main()
