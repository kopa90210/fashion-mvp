# Railway AI worker

Create a dedicated Railway service from the same repository as the web application. Do not add an HTTP domain or health-check path: this is a continuously running process, not a web server.

## Service settings

- Service name: `stylegraph-ai-worker`
- Replicas: `1`
- Custom Dockerfile variable: `RAILWAY_DOCKERFILE_PATH=Dockerfile.worker`
- Start command: `python -m ai_service.worker --poll-seconds 2 --heartbeat-seconds 60`
- Restart policy: `Always`
- Cron: disabled

Railway owns process supervision. A fatal startup or loop error exits non-zero and is restarted by the platform. Provider and individual job failures are handled by the existing job lifecycle and do not terminate the process.

## Required server-only variables

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (preferred) or `SUPABASE_SERVICE_KEY`
- `GROQ_API_KEY`
- `OUTFIT_PROVIDER=gemini`
- `GEMINI_API_KEY`
- `GEMINI_OUTFIT_MODEL`

Do not use `NEXT_PUBLIC_` names for worker credentials. Do not copy secret values into logs, source files, or deployment screenshots.

## Healthy behavior

Deployment logs must show one `WORKER_STARTED` event followed by `WORKER_HEARTBEAT` at least once per minute while idle. Heartbeats report the worker ID and last claim/success timestamps. A healthy worker can claim a newly queued job within the configured two-second poll interval plus database/network latency. Raw HTTP transport INFO logs are disabled because request URLs can contain private database filters and storage object paths.

## Deployment acceptance

1. Confirm only one worker replica is configured.
2. Confirm startup logs name the Gemini provider and contain no credential values.
3. Upload three new outfit photos without restarting or manually invoking the worker.
4. Confirm all three jobs are automatically claimed and reach reviewable garment drafts.
5. Record queue wait for each upload from `OUTFIT_PIPELINE_TIMING`; investigate sustained waits above five seconds.
6. Terminate a worker while a disposable job holds a lease, wait for lease expiry, and confirm a restarted worker reclaims it without duplicate drafts.

The claim RPC already uses `FOR UPDATE SKIP LOCKED`, a unique lease owner, and lease expiry. Completion verifies the current lease owner and attempt before creating drafts, so a stale worker cannot commit after another worker reclaims the job.
