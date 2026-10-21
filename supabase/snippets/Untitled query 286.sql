select
  id,
  job_id,
  
  status,
  provider,
  model,
  safe_error_code,
  created_at
 
from public.ai_runs

order by created_at asc;